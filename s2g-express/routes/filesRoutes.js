const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const QRCode = require("qrcode");
const archiver = require("archiver");
const PDFDocument = require("pdfkit");
const os = require("os");
const AdmZip = require("adm-zip");
const logger = require("../logger");
require("dotenv").config();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const { projectName, sectionName, fileName } = req.body;
    if (!projectName || !sectionName || !fileName) {
      return cb(
        new Error("Project, section, or file name missing in request body.")
      );
    }
    const uploadPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName,
      fileName
    );
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ("IPv4" === iface.family && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

router.post("/upload", upload.single("file"), async (req, res) => {
  const { fileName, sectionName, projectName, tags } = req.body;
  const originalFileName = req.file.originalname;
  const filePath = path.posix.join(
    "uploads",
    projectName,
    sectionName,
    fileName,
    originalFileName
  );

  try {
    // Find section by name AND project name to avoid conflicts with same section names in different projects
    const [sectionResults] = await db.promise().query(
      `SELECT s.id FROM section s 
         JOIN project p ON s.project_id = p.id 
         WHERE s.section_name = ? AND p.project_name = ?`,
      [sectionName, projectName]
    );

    if (sectionResults.length === 0) {
      return res.status(400).send("Section not found.");
    }

    const sectionId = sectionResults[0].id;

    const sql =
      "INSERT INTO file (section_id, name, path_file, url_qr_code, path_pdf) VALUES (?, ?, ?, NULL, NULL)";
    const [insertResults] = await db
      .promise()
      .query(sql, [sectionId, fileName, filePath]);

    const fileId = insertResults.insertId;

    const serverIP = process.env.SERVER_IP || getLocalIPv4();
    const serverPort = process.env.SERVER_PORT || 6301;
    const fileUrl = `http://${serverIP}:${serverPort}/api/uploadFile/download-file/${fileId}`;

    const pdfPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName,
      fileName,
      `${fileName}_qr.pdf`
    );

    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfPath));

    QRCode.toDataURL(
      fileUrl,
      { errorCorrectionLevel: "H" },
      async (err, url) => {
        if (err) {
          console.error("Error generating QR code:", err);
          return;
        }

        doc.fontSize(48).font("Helvetica-Bold");

        const textWidth = doc.widthOfString(fileName);
        const pageWidth = doc.page.width;
        const textX = (pageWidth - textWidth) / 2;
        const textY = 50;

        doc.text(fileName, textX, textY);

        doc.fontSize(20).font("Helvetica");
        const subText = `${projectName} / ${sectionName} / ${fileName}`;
        const subTextWidth = doc.widthOfString(subText);
        const subTextX = (pageWidth - subTextWidth) / 2;
        const subTextY = textY + 100;
        doc.text(subText, subTextX, subTextY);

        if (tags && tags.length > 0) {
          doc.fontSize(20).font("Helvetica");
          const tagsText = Array.isArray(tags) ? tags.join(", ") : tags;
          const tagsTextWidth = doc.widthOfString(tagsText);
          const tagsTextX = (pageWidth - tagsTextWidth) / 2;
          const tagsTextY = subTextY + 70;
          doc.text(tagsText, tagsTextX, tagsTextY);
        }

        const qrCodeWidth = 250;
        const qrCodeHeight = 250;
        const pageHeight = doc.page.height;
        const x = (pageWidth - qrCodeWidth) / 2;
        let y = 0;
        if (tags && tags.length > 0) {
          y = (pageHeight - qrCodeHeight) / 2;
        } else {
          y = (pageHeight - qrCodeHeight) / 2;
        }

        doc.image(url, x, y, {
          fit: [qrCodeWidth, qrCodeHeight],
          align: "center",
          valign: "center",
        });

        // Ajouter l'URL du QR code en dessous du QR code
        doc.fontSize(12).font("Helvetica");
        const urlTextWidth = doc.widthOfString(fileUrl);
        const urlTextX = (pageWidth - urlTextWidth) / 2;
        const urlTextY = y + qrCodeHeight + 70;
        doc.text(fileUrl, urlTextX, urlTextY);

        doc.end();

        // Calculer le chemin relatif et normaliser avec des forward slashes
        const pdfRelativePath = path
          .relative(path.join(__dirname, ".."), pdfPath)
          .split(path.sep)
          .join("/");

        await db
          .promise()
          .query("UPDATE file SET url_qr_code = ?, path_pdf = ? WHERE id = ?", [
            fileUrl,
            pdfRelativePath,
            fileId,
          ]);

        if (tags && tags.length > 0) {
          if (Array.isArray(tags)) {
            for (const tagName of tags) {
              await db
                .promise()
                .query("INSERT INTO tag (file_id, tag_name) VALUES (?, ?)", [
                  fileId,
                  tagName,
                ]);
            }
          } else {
            await db
              .promise()
              .query("INSERT INTO tag (file_id, tag_name) VALUES (?, ?)", [
                fileId,
                tags,
              ]);
          }
        }

        const [fileInfo] = await db
          .promise()
          .query("SELECT created_at FROM file WHERE id = ?", [fileId]);
        const createdAt = fileInfo[0].created_at;

        logger.info(
          `File uploaded: ID="${fileId}", File name: "${fileName}", In Section: "${sectionName}", of Project: "${projectName}", Uploaded At: "${createdAt}"`
        );

        res
          .status(200)
          .send(
            "Fichier téléchargé, QR code généré dans un PDF et informations enregistrées avec succès."
          );
      }
    );
  } catch (err) {
    console.error("Erreur lors de l'insertion dans la base de données :", err);
    return res
      .status(500)
      .send("Erreur lors de l'insertion dans la base de données.");
  }
});

router.get("/checkFileName", async (req, res) => {
  const { fileName, sectionId } = req.query;

  if (!fileName || !sectionId) {
    return res
      .status(400)
      .json({ error: "Nom de fichier et ID de section requis." });
  }

  try {
    const [fileResults] = await db.promise().query(
      `
        SELECT * FROM file 
        WHERE section_id = ? AND name = ?
      `,
      [sectionId, fileName]
    );

    res.json({ exists: fileResults.length > 0 });
  } catch (err) {
    console.error("Erreur lors de la vérification du nom de fichier :", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.use("/uploads", (req, res, next) => {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${path.basename(req.url)}"`
  );
  next();
});

router.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Route de téléchargement direct du fichier (pour les QR codes)
router.get("/download-file/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    const [fileResults] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "Fichier non trouvé." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);

    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: "Fichier non trouvé sur le disque." });
    }

    // Obtenir le nom du fichier original
    const originalFileName = path.basename(file.path_file);

    // Définir les headers pour le téléchargement
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${originalFileName}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    // Envoyer le fichier
    res.sendFile(filePath);
  } catch (err) {
    console.error("Erreur lors du téléchargement du fichier :", err);
    res.status(500).json({ error: "Erreur serveur lors du téléchargement." });
  }
});

router.get("/files/:sectionId", async (req, res) => {
  const { sectionId } = req.params;

  try {
    const [files] = await db
      .promise()
      .query("SELECT * FROM file WHERE section_id = ?", [sectionId]);

    // Ajouter la récupération de la taille du fichier
    const filesWithSize = await Promise.all(
      files.map(async (file) => {
        try {
          const filePath = path.join(__dirname, "..", file.path_file);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            return { ...file, size: stats.size };
          } else {
            console.warn(
              `File not found on disk for ${file.name}: ${filePath}`
            );
            return { ...file, size: 0 };
          }
        } catch (error) {
          console.error(`Error getting file size for ${file.name}:`, error);
          return { ...file, size: 0 }; // Taille 0 en cas d'erreur
        }
      })
    );

    res.json(filesWithSize);
  } catch (err) {
    console.error("Erreur lors de la récupération des fichiers :", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/files/:fileId/tags", async (req, res) => {
  const { fileId } = req.params;

  try {
    const [tags] = await db
      .promise()
      .query("SELECT tag_name FROM tag WHERE file_id = ?", [fileId]);

    // Formatter les résultats pour renvoyer un tableau de noms de tags
    const tagNames = tags.map((tag) => tag.tag_name);

    res.json(tagNames);
  } catch (err) {
    console.error("Erreur lors de la récupération des tags :", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/files/:fileId", async (req, res) => {
  const { fileId } = req.params;
  logger.info(`Récupération du fichier avec l'ID : ${fileId}`);
  try {
    const sql = "SELECT * FROM file WHERE id = ?"; // Stocker la requête dans une variable
    logger.info("Requête SQL :", sql, [fileId]); // Afficher la requête et les paramètres
    const [files] = await db.promise().query(sql, [fileId]);

    logger.info("Résultat de la requête SQL :", files);

    if (files.length === 0) {
      logger.info(`Fichier avec l'ID : ${fileId} non trouvé.`);
      return res.status(404).json({ error: "Fichier non trouvé." });
    }

    logger.info(`Fichier avec l'ID : ${fileId} trouvé :`, files);
    res.json(files);
  } catch (err) {
    console.error("Erreur lors de la récupération du fichier :", err);
    console.error("Erreur SQL:", err.sqlMessage, err.sql); // Afficher plus d'informations
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/download/:fileId", async (req, res) => {
  const fileId = req.params.fileId;

  try {
    // Récupérer les informations du fichier depuis la base de données
    const [fileResults] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "Fichier non trouvé." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);
    const folderPath = path.dirname(filePath);

    // Vérifier si le dossier existe
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Dossier du fichier introuvable." });
    }

    // Créer une archive ZIP du dossier
    const zip = new AdmZip();
    zip.addLocalFolder(folderPath);
    const zipBuffer = zip.toBuffer();

    // Définir les en-têtes de réponse pour le téléchargement
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${file.name}.zip"`); // Utiliser le nom du fichier
    res.send(zipBuffer);
  } catch (err) {
    console.error("Erreur lors du téléchargement du fichier :", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur lors du téléchargement." });
  }
});

router.delete("/files/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    // 1. Récupérer les informations du fichier depuis la base de données
    const [fileResults] = await db
      .promise()
      .query("SELECT *, updated_at FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "Fichier non trouvé." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);
    const pdfPath = path.join(__dirname, "..", file.path_pdf);
    const updatedAt = file.updated_at;

    // 2. Récupérer le nom de la section et du projet
    const [sectionResults] = await db
      .promise()
      .query("SELECT section_name, project_id FROM section WHERE id = ?", [
        file.section_id,
      ]);

    if (sectionResults.length === 0) {
      return res.status(404).json({ error: "Section non trouvée." });
    }

    const sectionName = sectionResults[0].section_name;
    const projectId = sectionResults[0].project_id;

    const [projectResults] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);

    if (projectResults.length === 0) {
      return res.status(404).json({ error: "Projet non trouvé." });
    }

    const projectName = projectResults[0].project_name;

    // 3. Supprimer le fichier et le PDF du système de fichiers
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    // 4. Supprimer le dossier contenant le fichier
    const folderPath = path.dirname(filePath);
    if (fs.existsSync(folderPath) && fs.readdirSync(folderPath).length === 0) {
      fs.rmdirSync(folderPath);
    }

    // 5. Supprimer l'entrée du fichier de la base de données
    await db.promise().query("DELETE FROM file WHERE id = ?", [fileId]);

    // 6. Supprimer les tags associés au fichier
    await db.promise().query("DELETE FROM tag WHERE file_id = ?", [fileId]);

    // Journalisation de la suppression du fichier
    logger.info(
      `File deleted: ID="${fileId}", File name: "${file.name}", Path file: "${file.path_file}", Path pdf: "${file.path_pdf}", In Section: "${sectionName}", Of Project: "${projectName}", Deleted At: "${updatedAt}"`
    );

    res.json({ message: "Fichier supprimé avec succès." });
  } catch (err) {
    console.error("Erreur lors de la suppression du fichier :", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur lors de la suppression du fichier." });
  }
});

router.put("/files/:fileId", upload.single("file"), async (req, res) => {
  const { fileId } = req.params;
  const { fileName, projectName, sectionName, tags } = req.body;
  const newFile = req.file;

  const generatePdfAndQrCode = (
    fileUrl,
    pdfPath,
    fileName,
    projectName,
    sectionName,
    tags
  ) => {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      // Ensure destination directory exists
      try {
        fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
      } catch (e) {
        // ignore mkdir errors
      }
      doc.pipe(fs.createWriteStream(pdfPath));

      QRCode.toDataURL(fileUrl, { errorCorrectionLevel: "H" }, (err, url) => {
        if (err) return reject("Erreur lors de la génération du QR code.");

        doc.fontSize(48).font("Helvetica-Bold");

        const textWidth = doc.widthOfString(fileName);
        const pageWidth = doc.page.width;
        const textX = (pageWidth - textWidth) / 2;
        const textY = 50;

        doc.text(fileName, textX, textY);

        doc.fontSize(20).font("Helvetica");
        const subText = `${projectName} / ${sectionName} / ${fileName}`;
        const subTextWidth = doc.widthOfString(subText);
        const subTextX = (pageWidth - subTextWidth) / 2;
        const subTextY = textY + 100;
        doc.text(subText, subTextX, subTextY);

        if (tags && tags.length > 0) {
          doc.fontSize(20).font("Helvetica");
          const tagsText = Array.isArray(tags) ? tags.join(", ") : tags;
          const tagsTextWidth = doc.widthOfString(tagsText);
          const tagsTextX = (pageWidth - tagsTextWidth) / 2;
          const tagsTextY = subTextY + 70;
          doc.text(tagsText, tagsTextX, tagsTextY);
        }

        const qrCodeWidth = 250;
        const qrCodeHeight = 250;
        const pageHeight = doc.page.height;
        const x = (pageWidth - qrCodeWidth) / 2;
        let y = 0;
        if (tags && tags.length > 0) {
          y = (pageHeight - qrCodeHeight) / 2;
        } else {
          y = (pageHeight - qrCodeHeight) / 2;
        }

        doc.image(url, x, y, {
          fit: [qrCodeWidth, qrCodeHeight],
          align: "center",
          valign: "center",
        });

        // Ajouter l'URL du QR code en dessous du QR code
        doc.fontSize(12).font("Helvetica");
        const urlTextWidth = doc.widthOfString(fileUrl);
        const urlTextX = (pageWidth - urlTextWidth) / 2;
        const urlTextY = y + qrCodeHeight + 70;
        doc.text(fileUrl, urlTextX, urlTextY);

        doc.end();
        resolve();
      });
    });
  };

  try {
    const [existingFiles] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);
    if (existingFiles.length === 0)
      return res.status(404).json({ error: "Fichier non trouvé." });

    const oldFileName = existingFiles[0].name;
    const oldFilePath = path.join(__dirname, "..", existingFiles[0].path_file);
    const oldFolderPath = path.dirname(oldFilePath);
    const oldFileBasename = path.basename(oldFilePath);

    // Filesystem-safe paths (use platform-aware path.join for FS operations)
    const parentFolderFs = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName
    );
    const newFolderFs = path.join(parentFolderFs, fileName);
    const newFileFs = path.join(
      newFolderFs,
      newFile ? newFile.originalname : oldFileBasename
    );

    // Fonction pour supprimer un dossier récursivement
    const deleteFolderRecursive = (folderPath) => {
      if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
          const curPath = path.join(folderPath, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            deleteFolderRecursive(curPath);
          } else {
            fs.unlinkSync(curPath);
          }
        });
        fs.rmdirSync(folderPath);
      }
    };

    // Cas 1: Nouveau fichier uploadé - on supprime tout l'ancien dossier et on recrée
    if (newFile) {
      // Supprimer l'ancien dossier complet
      if (fs.existsSync(oldFolderPath)) {
        deleteFolderRecursive(oldFolderPath);
        logger.info(`Ancien dossier supprimé: ${oldFolderPath}`);
      }

      // Créer le nouveau dossier
      fs.mkdirSync(newFolderFs, { recursive: true });
      logger.info(`Nouveau dossier créé: ${newFolderFs}`);

      // Déplacer le nouveau fichier uploadé
      fs.renameSync(newFile.path, newFileFs);
      logger.info(`Nouveau fichier uploadé: ${newFileFs}`);
    }
    // Cas 2: Pas de nouveau fichier mais le nom a changé - on renomme le dossier
    else if (oldFileName !== fileName) {
      if (fs.existsSync(oldFolderPath)) {
        // Supprimer l'ancien PDF (sera régénéré avec le nouveau nom)
        const oldPdfPath = path.join(oldFolderPath, `${oldFileName}_qr.pdf`);
        if (fs.existsSync(oldPdfPath)) {
          fs.unlinkSync(oldPdfPath);
        }

        // Renommer le dossier
        fs.mkdirSync(path.dirname(newFolderFs), { recursive: true });
        fs.renameSync(oldFolderPath, newFolderFs);
        logger.info(`Dossier renommé de ${oldFolderPath} vers ${newFolderFs}`);
      }
    }
    // Cas 3: Ni nouveau fichier ni changement de nom - on régénère juste le PDF
    else {
      // Supprimer l'ancien PDF (sera régénéré)
      const oldPdfPath = path.join(oldFolderPath, `${oldFileName}_qr.pdf`);
      if (fs.existsSync(oldPdfPath)) {
        fs.unlinkSync(oldPdfPath);
      }
    }

    // Build DB-stored relative path (use forward slashes)
    const newFileRelativePath = path
      .relative(path.join(__dirname, ".."), newFileFs)
      .split(path.sep)
      .join("/");

    const serverIP = process.env.SERVER_IP || getLocalIPv4();
    const serverPort = process.env.SERVER_PORT || 6301;
    const fileUrl = `http://${serverIP}:${serverPort}/api/uploadFile/download-file/${fileId}`;
    const pdfFsPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName,
      fileName,
      `${fileName}_qr.pdf`
    );

    await generatePdfAndQrCode(
      fileUrl,
      pdfFsPath,
      fileName,
      projectName,
      sectionName,
      tags
    );

    // Calculer le chemin relatif et normaliser avec des forward slashes
    const pdfRelativePath = path
      .relative(path.join(__dirname, ".."), pdfFsPath)
      .split(path.sep)
      .join("/");
    await db
      .promise()
      .query(
        "UPDATE file SET name = ?, path_file = ?, url_qr_code = ?, path_pdf = ? WHERE id = ?",
        [
          fileName,
          newFileRelativePath, // store relative path as-is (already relative to project root)
          fileUrl,
          pdfRelativePath,
          fileId,
        ]
      );

    if (tags && tags.length > 0) {
      const tagNames = Array.isArray(tags) ? tags : [tags];
      const [existingTags] = await db
        .promise()
        .query("SELECT tag_name FROM tag WHERE file_id = ?", [fileId]);
      const existingTagNames = existingTags.map((tag) => tag.tag_name);

      for (const tagName of tagNames) {
        if (!existingTagNames.includes(tagName))
          await db
            .promise()
            .query("INSERT INTO tag (file_id, tag_name) VALUES (?, ?)", [
              fileId,
              tagName,
            ]);
      }
      for (const existingTagName of existingTagNames) {
        if (!tagNames.includes(existingTagName))
          await db
            .promise()
            .query("DELETE FROM tag WHERE file_id = ? AND tag_name = ?", [
              fileId,
              existingTagName,
            ]);
      }
    } else {
      await db.promise().query("DELETE FROM tag WHERE file_id = ?", [fileId]);
    }

    logger.info(
      `File updated: ID="${fileId}", Old name: "${oldFileName}", New name: "${fileName}", New Path file: "${newFileRelativePath}", New Path PDF: "${pdfRelativePath}", In Section: "${sectionName}", Of Project: "${projectName}"`
    );
    res.status(200).json({ message: "Fichier mis à jour avec succès." });
  } catch (err) {
    console.error("Erreur lors de la mise à jour du fichier :", err);
    res
      .status(500)
      .json({ error: "Erreur serveur lors de la mise à jour du fichier." });
  }
});

router.get("/checkFileExists", async (req, res) => {
  const { projectName, sectionName, fileName, checkFileName } = req.query;

  if (!projectName || !sectionName || !fileName || !checkFileName) {
    return res
      .status(400)
      .json({ error: "Project, section, file, or checkFileName missing." });
  }

  const filePath = path.join(
    __dirname,
    "..",
    "uploads",
    projectName,
    sectionName,
    fileName,
    checkFileName
  );

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File does not exist
      return res.json({ exists: false });
    }
    // File exists
    return res.json({ exists: true });
  });
});

module.exports = router;
