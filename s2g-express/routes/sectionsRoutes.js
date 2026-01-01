const express = require("express");
const router = express.Router();
const multer = require("multer");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const logger = require("../logger");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const os = require("os");

// Fonction pour obtenir l'IP locale
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

// Fonction pour générer un PDF avec QR code
function generatePdfWithQrCode(
  fileUrl,
  pdfPath,
  fileName,
  projectName,
  sectionName,
  tags
) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();

    // S'assurer que le dossier existe
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

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
      const y = (pageHeight - qrCodeHeight) / 2;

      doc.image(url, x, y, {
        fit: [qrCodeWidth, qrCodeHeight],
        align: "center",
        valign: "center",
      });

      doc.fontSize(12).font("Helvetica");
      const urlTextWidth = doc.widthOfString(fileUrl);
      const urlTextX = (pageWidth - urlTextWidth) / 2;
      const urlTextY = y + qrCodeHeight + 70;
      doc.text(fileUrl, urlTextX, urlTextY);

      doc.end();
      resolve();
    });
  });
}

// Configuration de Multer pour gérer les fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { projectId, sectionNames } = req.body; // Access project and section info
    // 1. Get project name (same logic as before)
    db.promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId])
      .then(([project]) => {
        if (!project || project.length === 0) {
          return cb(new Error("Project not found"), null); // Handle project not found
        }
        const projectName = project[0].project_name;
        const projectPath = path.join(__dirname, "..", "uploads", projectName);
        const sectionPath = path.join(projectPath, sectionNames[0]); // Use the first section name for the initial folder.  If you need to handle multiple files per section, you'll need a more complex approach.
        fs.mkdirSync(sectionPath, { recursive: true }); // Create the directory
        cb(null, sectionPath); // Set the destination folder
      })
      .catch((err) => cb(err, null)); // Handle database errors
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    ); // Unique filenames
  },
});

const upload = multer({ storage: storage });

router.post("/addsections", upload.array("files"), async (req, res) => {
  const { projectId, sectionNames } = req.body;
  const errors = {};
  const sectionsToAdd = [];

  if (!projectId || !sectionNames || !Array.isArray(sectionNames)) {
    return res.status(400).json({ message: "Données invalides" });
  }

  try {
    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);

    if (!project || project.length === 0) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    const projectName = project[0].project_name;

    for (const sectionName of sectionNames) {
      if (!sectionName) continue;

      const [existingSection] = await db
        .promise()
        .query(
          "SELECT id FROM section WHERE project_id = ? AND section_name = ?",
          [projectId, sectionName]
        );

      if (existingSection && existingSection.length > 0) {
        errors[sectionName] = "This section name is already in use.";
      } else {
        sectionsToAdd.push(sectionName);
      }
    }

    if (Object.keys(errors).length > 0) {
      return res
        .status(400)
        .json({ message: "Des noms de section sont invalides.", errors });
    }

    for (const sectionName of sectionsToAdd) {
      const sectionPath = path.join(
        __dirname,
        "..",
        "uploads",
        projectName,
        sectionName
      );
      fs.mkdirSync(sectionPath, { recursive: true });

      // Insertion de la section et récupération de l'ID
      const [result] = await db
        .promise()
        .query("INSERT INTO section (project_id, section_name) VALUES (?, ?)", [
          projectId,
          sectionName,
        ]);

      const sectionId = result.insertId;

      // Récupération de la date de création
      const [sectionInfo] = await db
        .promise()
        .query("SELECT created_at FROM section WHERE id = ?", [sectionId]);

      const createdAt = sectionInfo[0].created_at;

      logger.info(
        `Section created: ID = ${sectionId}, section name: "${sectionName}" for project name: "${projectName}", Created at: ${createdAt}`
      );
    }

    res
      .status(201)
      .json({ message: "Sections et fichiers ajoutés avec succès" });
  } catch (error) {
    console.error("Erreur lors de l'ajout des sections:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route GET
router.get("/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const [sections] = await db
      .promise()
      .query("SELECT * FROM section WHERE project_id = ?", [projectId]);

    if (!sections || sections.length === 0) {
      // Renvoyer un tableau vide au lieu d'une erreur 404
      return res.status(200).json([]);
    }

    res.status(200).json(sections); // Envoyer les données des sections
  } catch (error) {
    console.error("Erreur lors de la récupération des sections:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

router.put("/:sectionId", async (req, res) => {
  const sectionId = req.params.sectionId;
  const { section_name: newSectionName } = req.body;

  if (!newSectionName) {
    return res.status(400).json({ error: "New section name is required." });
  }

  try {
    // 1. Get the current section name, project name, and updated_at
    const [section] = await db
      .promise()
      .query(
        "SELECT section_name, project_id, updated_at FROM section WHERE id = ?",
        [sectionId]
      );

    if (!section || section.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }

    const currentSectionName = section[0].section_name;
    const projectId = section[0].project_id;
    const sectionUpdatedAt = section[0].updated_at;

    // Si le nom n'a pas changé, ne rien faire
    if (currentSectionName === newSectionName) {
      const [updatedSection] = await db
        .promise()
        .query("SELECT * FROM section WHERE id = ?", [sectionId]);
      return res.status(200).json(updatedSection[0]);
    }

    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);

    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    // 2. Chemins des dossiers
    const oldFolderPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      currentSectionName
    );
    const newFolderPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      newSectionName
    );

    // 3. Renommer le dossier de section
    if (fs.existsSync(oldFolderPath)) {
      // Créer le nouveau dossier
      fs.mkdirSync(newFolderPath, { recursive: true });

      // Copier tous les sous-dossiers (fichiers) vers le nouveau dossier
      const items = fs.readdirSync(oldFolderPath);
      for (const item of items) {
        const oldItemPath = path.join(oldFolderPath, item);
        const newItemPath = path.join(newFolderPath, item);
        if (fs.lstatSync(oldItemPath).isDirectory()) {
          // Copier le dossier récursivement
          fs.cpSync(oldItemPath, newItemPath, { recursive: true });
        } else {
          fs.copyFileSync(oldItemPath, newItemPath);
        }
      }
    } else {
      logger.warn(
        `Folder ${oldFolderPath} does not exist. Creating new folder.`
      );
      fs.mkdirSync(newFolderPath, { recursive: true });
    }

    // 4. Update the database section name
    const [result] = await db
      .promise()
      .query("UPDATE section SET section_name = ? WHERE id = ?", [
        newSectionName,
        sectionId,
      ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Section not found for update." });
    }

    // 5. Update file paths and regenerate PDFs
    const [filesToUpdate] = await db
      .promise()
      .query(
        "SELECT id, name, path_file, url_qr_code, path_pdf FROM file WHERE section_id = ?",
        [sectionId]
      );

    const serverIP = process.env.SERVER_IP || getLocalIPv4();
    const serverPort = process.env.SERVER_PORT || 6301;

    for (const file of filesToUpdate) {
      const fileName = file.name;

      // Nouveau chemin du fichier
      const newPathFile = `uploads/${projectName}/${newSectionName}/${fileName}/${path.basename(
        file.path_file
      )}`;

      // Nouveau chemin du PDF
      const newPathPdf = `uploads/${projectName}/${newSectionName}/${fileName}/${fileName}_qr.pdf`;

      // L'URL QR code reste la même (basée sur l'ID du fichier)
      const fileUrl = `http://${serverIP}:${serverPort}/api/uploadFile/download-file/${file.id}`;

      // Supprimer l'ancien PDF dans le nouveau dossier (s'il existe)
      const oldPdfInNewFolder = path.join(
        newFolderPath,
        fileName,
        `${fileName}_qr.pdf`
      );
      if (fs.existsSync(oldPdfInNewFolder)) {
        fs.unlinkSync(oldPdfInNewFolder);
      }

      // Récupérer les tags du fichier
      const [tags] = await db
        .promise()
        .query("SELECT tag_name FROM tag WHERE file_id = ?", [file.id]);
      const tagNames = tags.map((t) => t.tag_name);

      // Générer le nouveau PDF
      const newPdfPath = path.join(__dirname, "..", newPathPdf);
      await generatePdfWithQrCode(
        fileUrl,
        newPdfPath,
        fileName,
        projectName,
        newSectionName,
        tagNames
      );

      // Mettre à jour la base de données
      await db
        .promise()
        .query(
          "UPDATE file SET path_file = ?, url_qr_code = ?, path_pdf = ? WHERE id = ?",
          [newPathFile, fileUrl, newPathPdf, file.id]
        );

      logger.info(
        `Updated file paths for file ID ${file.id}: ${fileName} - New section: ${newSectionName}`
      );
    }

    // 6. Supprimer l'ancien dossier de section
    if (fs.existsSync(oldFolderPath) && oldFolderPath !== newFolderPath) {
      fs.rmSync(oldFolderPath, { recursive: true, force: true });
      logger.info(`Deleted old section folder: ${oldFolderPath}`);
    }

    // 7. Return the updated section data and log the change
    const [updatedSection] = await db
      .promise()
      .query("SELECT * FROM section WHERE id = ?", [sectionId]);

    const updatedSectionData = updatedSection[0];

    // Log the section name change
    logger.info(
      `Section name changed - Old Name: "${currentSectionName}", New Name: "${updatedSectionData.section_name}", for project: "${projectName}", Updated at: ${sectionUpdatedAt}`
    );

    res.status(200).json(updatedSectionData);
  } catch (error) {
    logger.error("Error updating section:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:sectionId", async (req, res) => {
  const sectionId = req.params.sectionId;

  try {
    // Récupérer les informations de la section avant la suppression
    const [section] = await db
      .promise()
      .query(
        "SELECT section_name, project_id, updated_at FROM section WHERE id = ?",
        [sectionId]
      );

    if (!section || section.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }

    const sectionName = section[0].section_name;
    const projectId = section[0].project_id;
    const sectionUpdatedAt = section[0].updated_at;

    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);

    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    // 1. Delete the folder
    const folderPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName
    );

    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true });
    } else {
      console.warn(`Folder ${folderPath} does not exist. Skipping delete.`);
    }

    // 2. Delete the database entry
    const [result] = await db
      .promise()
      .query("DELETE FROM section WHERE id = ?", [sectionId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Section not found for deletion." });
    }

    // Journalisation de la suppression après la suppression
    logger.info(
      `Section deleted: ID = ${sectionId}, section name: "${sectionName}" for project name: "${projectName}", deleted at: ${sectionUpdatedAt}`
    );

    res.status(200).json({ message: "Section deleted successfully." });
  } catch (error) {
    console.error("Error deleting section:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/export/:sectionId", async (req, res) => {
  const sectionId = req.params.sectionId;

  try {
    const [section] = await db
      .promise()
      .query("SELECT section_name, project_id FROM section WHERE id = ?", [
        sectionId,
      ]);
    if (!section || section.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }
    const sectionName = section[0].section_name;
    const projectId = section[0].project_id;

    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    const folderPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName
    );

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Section folder not found." });
    }

    const [files] = await db
      .promise()
      .query("SELECT path_file FROM file WHERE section_id = ?", [sectionId]);

    if (!files || files.length === 0) {
      logger.info(
        `Section files export failed: Section ID=${sectionId}, Section Name="${sectionName}", Project Name="${projectName}", No files found.`
      );
      return res
        .status(404)
        .json({ error: "No files found for this section." });
    }

    const zip = new AdmZip();

    for (const file of files) {
      const filePath = path.join(__dirname, "..", file.path_file);
      if (fs.existsSync(filePath)) {
        const relativePath = path.relative(folderPath, filePath);
        zip.addLocalFile(filePath, path.dirname(relativePath));
      } else {
        console.warn(`File not found: ${filePath}`);
      }
    }

    const zipBuffer = zip.toBuffer();

    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename=${sectionName}.zip`);
    res.send(zipBuffer);

    const now = new Date();
    logger.info(
      `Section files exported: Section ID=${sectionId}, Section Name="${sectionName}", Project Name="${projectName}", Exported at: ${now.toISOString()}`
    );
  } catch (error) {
    console.error("Error exporting section:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/export-qr/:sectionId", async (req, res) => {
  const sectionId = req.params.sectionId;

  try {
    const [section] = await db
      .promise()
      .query("SELECT section_name, project_id FROM section WHERE id = ?", [
        sectionId,
      ]);
    if (!section || section.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }
    const sectionName = section[0].section_name;
    const projectId = section[0].project_id;

    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    const folderPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectName,
      sectionName
    );

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Section folder not found." });
    }

    const [files] = await db
      .promise()
      .query("SELECT path_pdf FROM file WHERE section_id = ?", [sectionId]);

    if (!files || files.length === 0) {
      logger.info(
        `Section QR codes export failed: Section ID=${sectionId}, Section Name="${sectionName}", Project Name="${projectName}", No QR code files found.`
      );
      return res
        .status(404)
        .json({ error: "No QR code files found for this section." });
    }

    const zip = new AdmZip();

    for (const file of files) {
      const filePath = path.join(__dirname, "..", file.path_pdf);
      if (fs.existsSync(filePath)) {
        const relativePath = path.relative(folderPath, filePath);
        zip.addLocalFile(filePath, path.dirname(relativePath));
      } else {
        console.warn(`QR code file not found: ${filePath}`);
      }
    }

    const zipBuffer = zip.toBuffer();

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename=${sectionName}_qr.zip`
    );
    res.send(zipBuffer);

    const now = new Date();
    logger.info(
      `Section QR codes exported: Section ID=${sectionId}, Section Name="${sectionName}", Project Name="${projectName}", Exported at: ${now.toISOString()}`
    );
  } catch (error) {
    console.error("Error exporting QR code files:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
