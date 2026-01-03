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
const crypto = require("crypto");
require("dotenv").config();

// Generate random folder name
function generateFolderName() {
  return crypto.randomBytes(16).toString("hex");
}

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const { projectName, sectionName, fileName } = req.body;
    if (!projectName || !sectionName || !fileName) {
      return cb(
        new Error("Project, section, or file name missing in request body.")
      );
    }

    try {
      // Get project and section folder names
      const [project] = await db
        .promise()
        .query("SELECT folder_name FROM project WHERE project_name = ?", [
          projectName,
        ]);
      const [section] = await db.promise().query(
        `SELECT s.folder_name FROM section s 
         JOIN project p ON s.project_id = p.id 
         WHERE s.section_name = ? AND p.project_name = ?`,
        [sectionName, projectName]
      );

      const projectFolderName = project[0]?.folder_name || projectName;
      const sectionFolderName = section[0]?.folder_name || sectionName;

      // Generate random folder name for file
      const fileFolderName = generateFolderName();
      req.fileFolderName = fileFolderName; // Store for later use

      const uploadPath = path.join(
        __dirname,
        "..",
        "uploads",
        projectFolderName,
        sectionFolderName,
        fileFolderName
      );
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
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

// Extract server base URL from FRONTEND_URLS (uses first non-localhost URL, port 80)
function getServerBaseUrl() {
  const frontendUrls = process.env.FRONTEND_URLS || "";
  const urls = frontendUrls.split(",").map((u) => u.trim());

  // Find a non-localhost URL to get the server IP
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        // Use the hostname with port 80 (Nginx)
        return `http://${parsed.hostname}`;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback to SERVER_IP:SERVER_PORT or local IP
  const serverIP = process.env.SERVER_IP || getLocalIPv4();
  const serverPort = process.env.SERVER_PORT || 6301;
  return `http://${serverIP}:${serverPort}`;
}

router.post("/upload", upload.single("file"), async (req, res) => {
  const { fileName, sectionName, projectName, tags } = req.body;
  const originalFileName = req.file.originalname;
  const fileFolderName = req.fileFolderName; // Get the random folder name from multer

  try {
    // Get project and section folder names
    const [projectResult] = await db
      .promise()
      .query("SELECT id, folder_name FROM project WHERE project_name = ?", [
        projectName,
      ]);
    if (!projectResult || projectResult.length === 0) {
      return res.status(400).send("Project not found.");
    }
    const projectFolderName = projectResult[0].folder_name || projectName;

    // Find section by name AND project name
    const [sectionResults] = await db.promise().query(
      `SELECT s.id, s.folder_name FROM section s 
         JOIN project p ON s.project_id = p.id 
         WHERE s.section_name = ? AND p.project_name = ?`,
      [sectionName, projectName]
    );

    if (sectionResults.length === 0) {
      return res.status(400).send("Section not found.");
    }

    const sectionId = sectionResults[0].id;
    const sectionFolderName = sectionResults[0].folder_name || sectionName;

    // Build file path using folder names
    const filePath = path.posix.join(
      "uploads",
      projectFolderName,
      sectionFolderName,
      fileFolderName,
      originalFileName
    );

    const sql =
      "INSERT INTO file (section_id, name, folder_name, path_file, url_qr_code, path_pdf) VALUES (?, ?, ?, ?, NULL, NULL)";
    const [insertResults] = await db
      .promise()
      .query(sql, [sectionId, fileName, fileFolderName, filePath]);

    const fileId = insertResults.insertId;

    // Use FRONTEND_URLS to get server base URL (port 80 via Nginx)
    const baseUrl = getServerBaseUrl();
    const fileUrl = `${baseUrl}/api/uploadFile/download-file/${fileId}`;

    const pdfPath = path.join(
      __dirname,
      "..",
      "uploads",
      projectFolderName,
      sectionFolderName,
      fileFolderName,
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

        // Calculate relative path with forward slashes
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
          `File uploaded: ID="${fileId}", File name: "${fileName}", Folder: "${fileFolderName}", In Section: "${sectionName}", of Project: "${projectName}", Uploaded At: "${createdAt}"`
        );

        res
          .status(200)
          .send(
            "File uploaded, QR code generated in PDF and information saved successfully."
          );
      }
    );
  } catch (err) {
    console.error("Error inserting into database:", err);
    return res.status(500).send("Error inserting into database.");
  }
});

router.get("/checkFileName", async (req, res) => {
  const { fileName, sectionId } = req.query;

  if (!fileName || !sectionId) {
    return res
      .status(400)
      .json({ error: "File name and section ID required." });
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
    console.error("Error checking file name:", err);
    return res.status(500).json({ error: "Server error." });
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

// Direct file download route (for QR codes)
router.get("/download-file/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    const [fileResults] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk." });
    }

    // Get original file name
    const originalFileName = path.basename(file.path_file);

    // Set headers for download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${originalFileName}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    // Send file
    res.sendFile(filePath);
  } catch (err) {
    console.error("Error downloading file:", err);
    res.status(500).json({ error: "Server error during download." });
  }
});

router.get("/files/:sectionId", async (req, res) => {
  const { sectionId } = req.params;

  try {
    const [files] = await db
      .promise()
      .query("SELECT * FROM file WHERE section_id = ?", [sectionId]);

    // Add file size
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
          return { ...file, size: 0 };
        }
      })
    );

    res.json(filesWithSize);
  } catch (err) {
    console.error("Error retrieving files:", err);
    return res.status(500).json({ error: "Server error." });
  }
});

router.get("/files/:fileId/tags", async (req, res) => {
  const { fileId } = req.params;

  try {
    const [tags] = await db
      .promise()
      .query("SELECT tag_name FROM tag WHERE file_id = ?", [fileId]);

    // Format results to return array of tag names
    const tagNames = tags.map((tag) => tag.tag_name);

    res.json(tagNames);
  } catch (err) {
    console.error("Error retrieving tags:", err);
    return res.status(500).json({ error: "Server error." });
  }
});

router.get("/files/:fileId", async (req, res) => {
  const { fileId } = req.params;
  logger.info(`Retrieving file with ID: ${fileId}`);
  try {
    const sql = "SELECT * FROM file WHERE id = ?";
    logger.info("SQL query:", sql, [fileId]);
    const [files] = await db.promise().query(sql, [fileId]);

    logger.info("SQL query result:", files);

    if (files.length === 0) {
      logger.info(`File with ID: ${fileId} not found.`);
      return res.status(404).json({ error: "File not found." });
    }

    logger.info(`File with ID: ${fileId} found:`, files);
    res.json(files);
  } catch (err) {
    console.error("Error retrieving file:", err);
    console.error("SQL error:", err.sqlMessage, err.sql);
    return res.status(500).json({ error: "Server error." });
  }
});

router.get("/download/:fileId", async (req, res) => {
  const fileId = req.params.fileId;

  try {
    // Get file information from database
    const [fileResults] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);
    const folderPath = path.dirname(filePath);

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "File folder not found." });
    }

    // Create ZIP archive of folder using DB name for ZIP
    const zip = new AdmZip();
    zip.addLocalFolder(folderPath);
    const zipBuffer = zip.toBuffer();

    // Set response headers for download - use display name from DB
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${file.name}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error("Error downloading file:", err);
    return res.status(500).json({ error: "Server error during download." });
  }
});

router.delete("/files/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    // 1. Get file information from database
    const [fileResults] = await db
      .promise()
      .query("SELECT *, updated_at FROM file WHERE id = ?", [fileId]);

    if (fileResults.length === 0) {
      return res.status(404).json({ error: "File not found." });
    }

    const file = fileResults[0];
    const filePath = path.join(__dirname, "..", file.path_file);
    const pdfPath = path.join(__dirname, "..", file.path_pdf);
    const updatedAt = file.updated_at;

    // 2. Get section and project names
    const [sectionResults] = await db
      .promise()
      .query("SELECT section_name, project_id FROM section WHERE id = ?", [
        file.section_id,
      ]);

    if (sectionResults.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }

    const sectionName = sectionResults[0].section_name;
    const projectId = sectionResults[0].project_id;

    const [projectResults] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);

    if (projectResults.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }

    const projectName = projectResults[0].project_name;

    // 3. Delete file and PDF from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }

    // 4. Delete folder containing the file
    const folderPath = path.dirname(filePath);
    if (fs.existsSync(folderPath) && fs.readdirSync(folderPath).length === 0) {
      fs.rmdirSync(folderPath);
    }

    // 5. Delete file entry from database
    await db.promise().query("DELETE FROM file WHERE id = ?", [fileId]);

    // 6. Delete tags associated with the file
    await db.promise().query("DELETE FROM tag WHERE file_id = ?", [fileId]);

    // Log file deletion
    logger.info(
      `File deleted: ID="${fileId}", File name: "${file.name}", Folder: "${file.folder_name}", Path file: "${file.path_file}", Path pdf: "${file.path_pdf}", In Section: "${sectionName}", Of Project: "${projectName}", Deleted At: "${updatedAt}"`
    );

    res.json({ message: "File deleted successfully." });
  } catch (err) {
    console.error("Error deleting file:", err);
    return res.status(500).json({ error: "Server error while deleting file." });
  }
});

router.put("/files/:fileId", upload.single("file"), async (req, res) => {
  const { fileId } = req.params;
  const { fileName, projectName, sectionName, tags } = req.body;
  const newFile = req.file;

  const generatePdfAndQrCode = (
    fileUrl,
    pdfPath,
    displayName,
    projectDisplayName,
    sectionDisplayName,
    tags
  ) => {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      try {
        fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
      } catch (e) {
        // ignore mkdir errors
      }
      doc.pipe(fs.createWriteStream(pdfPath));

      QRCode.toDataURL(fileUrl, { errorCorrectionLevel: "H" }, (err, url) => {
        if (err) return reject("Error generating QR code.");

        doc.fontSize(48).font("Helvetica-Bold");

        const textWidth = doc.widthOfString(displayName);
        const pageWidth = doc.page.width;
        const textX = (pageWidth - textWidth) / 2;
        const textY = 50;

        doc.text(displayName, textX, textY);

        doc.fontSize(20).font("Helvetica");
        const subText = `${projectDisplayName} / ${sectionDisplayName} / ${displayName}`;
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
  };

  try {
    // Get existing file info with folder_name
    const [existingFiles] = await db
      .promise()
      .query("SELECT * FROM file WHERE id = ?", [fileId]);
    if (existingFiles.length === 0)
      return res.status(404).json({ error: "File not found." });

    const oldFileName = existingFiles[0].name;
    const fileFolderName = existingFiles[0].folder_name;
    const oldFilePath = path.join(__dirname, "..", existingFiles[0].path_file);
    const oldFolderPath = path.dirname(oldFilePath);
    const oldFileBasename = path.basename(oldFilePath);

    // Get project and section folder names
    const [sectionResult] = await db
      .promise()
      .query(
        "SELECT id, folder_name, project_id FROM section WHERE section_name = ? AND project_id = (SELECT id FROM project WHERE project_name = ?)",
        [sectionName, projectName]
      );

    if (sectionResult.length === 0) {
      return res.status(404).json({ error: "Section not found." });
    }
    const sectionFolderName = sectionResult[0].folder_name;

    const [projectResult] = await db
      .promise()
      .query("SELECT folder_name FROM project WHERE project_name = ?", [
        projectName,
      ]);

    if (projectResult.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectFolderName = projectResult[0].folder_name;

    // Use folder names for filesystem paths (folders don't change when renaming)
    const folderFs = path.join(
      __dirname,
      "..",
      "uploads",
      projectFolderName,
      sectionFolderName,
      fileFolderName
    );

    let newFileRelativePath = existingFiles[0].path_file;

    // Delete old PDF (will be regenerated)
    const oldPdfPath = path.join(oldFolderPath, `${oldFileName}_qr.pdf`);
    if (fs.existsSync(oldPdfPath)) {
      fs.unlinkSync(oldPdfPath);
    }

    // If new file uploaded, replace the old one
    if (newFile) {
      // Delete old file
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      // Move new file to same folder (folder name stays the same)
      const newFileFs = path.join(folderFs, newFile.originalname);
      fs.mkdirSync(folderFs, { recursive: true });
      fs.renameSync(newFile.path, newFileFs);
      logger.info(`New file uploaded: ${newFileFs}`);

      // Update relative path
      newFileRelativePath = path
        .relative(path.join(__dirname, ".."), newFileFs)
        .split(path.sep)
        .join("/");
    }

    // Use FRONTEND_URLS to get server base URL (port 80 via Nginx)
    const baseUrl = getServerBaseUrl();
    const fileUrl = `${baseUrl}/api/uploadFile/download-file/${fileId}`;

    // PDF uses display name but stored in folder with random name
    const pdfFsPath = path.join(folderFs, `${fileName}_qr.pdf`);

    await generatePdfAndQrCode(
      fileUrl,
      pdfFsPath,
      fileName,
      projectName,
      sectionName,
      tags
    );

    // Calculate relative path for PDF
    const pdfRelativePath = path
      .relative(path.join(__dirname, ".."), pdfFsPath)
      .split(path.sep)
      .join("/");

    // Only update name in DB, folder_name stays the same
    await db
      .promise()
      .query(
        "UPDATE file SET name = ?, path_file = ?, url_qr_code = ?, path_pdf = ? WHERE id = ?",
        [fileName, newFileRelativePath, fileUrl, pdfRelativePath, fileId]
      );

    // Handle tags
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
      `File updated: ID="${fileId}", Old name: "${oldFileName}", New name: "${fileName}", Folder: "${fileFolderName}", In Section: "${sectionName}", Of Project: "${projectName}"`
    );
    res.status(200).json({ message: "File updated successfully." });
  } catch (err) {
    console.error("Error updating file:", err);
    res.status(500).json({ error: "Server error while updating file." });
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
