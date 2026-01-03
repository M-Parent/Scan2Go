const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const AdmZip = require("adm-zip");
const fs = require("fs");
const db = require("../db");
const logger = require("../logger");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const os = require("os");
const crypto = require("crypto");

// Generate random folder name
function generateFolderName() {
  return crypto.randomBytes(16).toString("hex");
}

// Get local IPv4 address
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

// Function to generate PDF with QR code
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

    // Ensure directory exists
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

    doc.pipe(fs.createWriteStream(pdfPath));

    QRCode.toDataURL(fileUrl, { errorCorrectionLevel: "H" }, (err, url) => {
      if (err) return reject("Error generating QR code.");

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

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectImgFolder = path.join("uploads", "project_img");
    fs.mkdirSync(projectImgFolder, { recursive: true });
    cb(null, projectImgFolder);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename =
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});
const upload = multer({ storage: storage });

// Create project
router.post("/", upload.single("projectImage"), (req, res) => {
  const { projectName } = req.body;
  const projectImage = req.file ? req.file.path.replace(/\\/g, "/") : null;

  if (!projectName) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Project name is required." });
  }

  db.query(
    "SELECT 1 FROM project WHERE project_name = ?",
    [projectName],
    (err, results) => {
      if (err) {
        console.error("Error verifying project name:", err);
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: "Error verifying project name." });
      }

      if (results && results.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ error: "This project name already exists." });
      }

      // Generate random folder name instead of using project name
      const folderName = generateFolderName();
      const projectFolder = path.join("uploads", folderName);
      fs.mkdirSync(projectFolder, { recursive: true });

      db.query(
        "INSERT INTO project (project_name, folder_name, project_image) VALUES (?, ?, ?)",
        [projectName, folderName, projectImage],
        (err, insertResult) => {
          if (err) {
            console.error("Error adding project:", err);
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: "Error adding project." });
          }

          const newProjectId =
            insertResult && insertResult.insertId
              ? insertResult.insertId
              : null;
          if (!newProjectId) {
            return res.status(500).json({
              error: "Unable to retrieve new project ID.",
            });
          }

          db.query(
            "SELECT * FROM project WHERE id = ?",
            [newProjectId],
            (err, newProjectResults) => {
              if (err) {
                console.error("Error retrieving new project:", err);
                return res.status(500).json({
                  error: "Error retrieving new project.",
                });
              }
              const newProject = newProjectResults[0];
              logger.info(
                `Project created: ID=${newProject.id}, Name="${newProject.project_name}", Folder="${newProject.folder_name}", Image Path="${newProject.project_image}", Created At=${newProject.created_at}`
              );
              return res.status(201).json(newProject);
            }
          );
        }
      );
    }
  );
});

// List projects
router.get("/", (req, res) => {
  db.query("SELECT * FROM project", (err, results) => {
    if (err) return res.status(500).json({ error: "Server error" });
    res.status(200).json(results);
  });
});

// Get single project
router.get("/:id", (req, res) => {
  const projectId = req.params.id;
  db.query(
    "SELECT * FROM project WHERE id = ?",
    [projectId],
    (err, results) => {
      if (err) return res.status(500).json({ error: "Server error" });
      if (!results || results.length === 0)
        return res.status(404).json({ error: "Project not found." });
      res.status(200).json(results[0]);
    }
  );
});

// Update project - keep existing name/image when not provided
// Folder is NOT renamed when project name changes (uses random folder_name)
router.put("/:id", upload.single("projectImage"), async (req, res) => {
  const projectId = req.params.id;
  let { projectName } = req.body;
  let newProjectImage = req.file ? req.file.path.replace(/\\/g, "/") : null;

  try {
    // Check duplicate name (only if provided)
    if (projectName) {
      const [existing] = await db
        .promise()
        .query("SELECT 1 FROM project WHERE project_name = ? AND id != ?", [
          projectName,
          projectId,
        ]);
      if (existing && existing.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ error: "This project name already exists." });
      }
    }

    // Fetch current project
    const [rows] = await db
      .promise()
      .query(
        "SELECT project_name, folder_name, project_image FROM project WHERE id = ?",
        [projectId]
      );

    if (!rows || rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Project not found." });
    }

    const current = rows[0];
    const finalName =
      projectName && projectName.trim() !== ""
        ? projectName.trim()
        : current.project_name;

    // If a new image was uploaded, use it; otherwise keep existing image
    let finalImage = current.project_image;
    if (newProjectImage) {
      finalImage = newProjectImage;
      // Delete old image if it exists
      if (current.project_image) {
        const oldImagePath = path.join(__dirname, "..", current.project_image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    // Update project (no folder renaming needed - folder_name stays the same)
    await db
      .promise()
      .query(
        "UPDATE project SET project_name = ?, project_image = ? WHERE id = ?",
        [finalName, finalImage, projectId]
      );

    const [updatedRows] = await db
      .promise()
      .query("SELECT * FROM project WHERE id = ?", [projectId]);

    const updatedProject = updatedRows[0];

    if (current.project_name !== updatedProject.project_name) {
      logger.info(
        `Project name changed - Old: "${current.project_name}", New: "${updatedProject.project_name}", Updated at: ${updatedProject.updated_at}`
      );
    }

    return res.status(200).json(updatedProject);
  } catch (err) {
    console.error("Error updating project:", err);
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE route - uses folder_name for filesystem operations
router.delete("/:id", async (req, res) => {
  const projectId = req.params.id;

  try {
    const [results] = await db
      .promise()
      .query(
        "SELECT project_name, folder_name, project_image FROM project WHERE id = ?",
        [projectId]
      );

    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }

    const project = results[0];
    const folderName = project.folder_name || project.project_name; // fallback for old data
    const projectFolder = path.join(__dirname, "..", "uploads", folderName);

    // Delete project image if exists
    if (project.project_image) {
      const imagePath = path.join(__dirname, "..", project.project_image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        logger.info("Image deleted:", imagePath);
      }
    }

    // Log before deletion
    logger.info(
      `Project deleted: ID=${projectId}, Name="${project.project_name}", Folder="${folderName}"`
    );

    // Delete from database (CASCADE will delete sections and files)
    await db.promise().query("DELETE FROM project WHERE id = ?", [projectId]);

    // Delete project folder
    if (fs.existsSync(projectFolder)) {
      fs.rmSync(projectFolder, { recursive: true, force: true });
      logger.info("Folder deleted:", projectFolder);
    }

    return res.status(204).json();
  } catch (err) {
    console.error("Error deleting project:", err);
    return res.status(500).json({ error: "Error deleting project." });
  }
});

router.get("/export-project-files/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const [project] = await db
      .promise()
      .query("SELECT project_name, folder_name FROM project WHERE id = ?", [
        projectId,
      ]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;
    const folderName = project[0].folder_name || projectName; // fallback for old data

    const projectFolder = path.join(__dirname, "..", "uploads", folderName);

    if (!fs.existsSync(projectFolder)) {
      return res.status(404).json({ error: "Project folder not found." });
    }

    // Get all files with their DB names for proper ZIP structure
    const [files] = await db.promise().query(
      `
        SELECT file.id, file.name as file_name, file.path_file,
               section.section_name
        FROM file
        JOIN section ON file.section_id = section.id
        WHERE section.project_id = ?
      `,
      [projectId]
    );

    if (!files || files.length === 0) {
      logger.info(
        `Project files export failed: Project ID=${projectId}, Project Name="${projectName}", No files found.`
      );
      return res
        .status(404)
        .json({ error: "No files found for this project." });
    }

    const zip = new AdmZip();

    // Use DB names (section_name, file_name) for ZIP structure, not folder names
    for (const file of files) {
      const filePath = path.join(__dirname, "..", file.path_file);
      if (fs.existsSync(filePath)) {
        // Create path using DB names: sectionName/fileName/actualFile
        const zipPath = path.join(file.section_name, file.file_name);
        zip.addLocalFile(filePath, zipPath);
      } else {
        console.warn(`File not found: ${filePath}`);
      }
    }

    const zipBuffer = zip.toBuffer();

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename=${projectName}_files.zip`
    );
    res.send(zipBuffer);

    const now = new Date();
    logger.info(
      `Project files exported: Project ID=${projectId}, Project Name="${projectName}", Exported at: ${now.toISOString()}`
    );
  } catch (error) {
    console.error("Error exporting project files:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/export-project-qr/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const [project] = await db
      .promise()
      .query("SELECT project_name, folder_name FROM project WHERE id = ?", [
        projectId,
      ]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;
    const folderName = project[0].folder_name || projectName;

    const projectFolder = path.join(__dirname, "..", "uploads", folderName);

    if (!fs.existsSync(projectFolder)) {
      return res.status(404).json({ error: "Project folder not found." });
    }

    // Get all QR PDF files with their DB names
    const [files] = await db.promise().query(
      `
        SELECT file.id, file.name as file_name, file.path_pdf,
               section.section_name
        FROM file
        JOIN section ON file.section_id = section.id
        WHERE section.project_id = ?
      `,
      [projectId]
    );

    if (!files || files.length === 0) {
      logger.info(
        `Project QR codes export failed: Project ID=${projectId}, Project Name="${projectName}", No QR code files found.`
      );
      return res
        .status(404)
        .json({ error: "No QR code files found for this project." });
    }

    const zip = new AdmZip();

    // Use DB names for ZIP structure
    for (const file of files) {
      const normalizedPath = file.path_pdf.split("/").join(path.sep);
      const filePath = path.join(__dirname, "..", normalizedPath);
      if (fs.existsSync(filePath)) {
        // Create path using DB names: sectionName/fileName/
        const zipPath = path.join(file.section_name, file.file_name);
        zip.addLocalFile(filePath, zipPath);
      } else {
        console.warn(`QR code file not found: ${filePath}`);
      }
    }

    const zipBuffer = zip.toBuffer();

    res.set("Content-Type", "application/zip");
    res.set(
      "Content-Disposition",
      `attachment; filename=${projectName}_qr.zip`
    );
    res.send(zipBuffer);

    // Ajout du message de journalisation
    const now = new Date();
    logger.info(
      `Project QR codes exported: Project ID=${projectId}, Project Name="${projectName}", Exported at: ${now.toISOString()}`
    );
  } catch (error) {
    console.error("Error exporting project QR codes:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:projectId/search", async (req, res) => {
  const projectId = req.params.projectId;
  const searchTerm = req.query.term || "";

  try {
    const sql = `SELECT DISTINCT ON (f.id)
      f.*,
      s.section_name,
      p.project_name
      FROM file f
      JOIN section s ON f.section_id = s.id
      JOIN project p ON s.project_id = p.id
      LEFT JOIN tag t ON f.id = t.file_id
      WHERE p.id = ? AND (
        f.name ILIKE ? OR
        s.section_name ILIKE ? OR
        t.tag_name ILIKE ?
      )
      ORDER BY f.id`;

    const [results] = await db
      .promise()
      .query(sql, [
        projectId,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
      ]);

    res.status(200).json(results);
  } catch (err) {
    console.error("Error searching files:", err);
    res.status(500).json({ error: "Error searching files." });
  }
});

module.exports = router;
