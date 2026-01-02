const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const AdmZip = require("adm-zip");
const fs = require("fs");
const db = require("../db");
const logger = require("../logger");

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
    return res.status(400).json({ error: "Le nom du projet est requis." });
  }

  db.query(
    "SELECT 1 FROM project WHERE project_name = ?",
    [projectName],
    (err, results) => {
      if (err) {
        console.error("Erreur lors de la vérification du nom du projet :", err);
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(500)
          .json({ error: "Erreur lors de la vérification du nom du projet." });
      }

      if (results && results.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Ce nom de projet existe déjà." });
      }

      const projectFolder = path.join("uploads", projectName);
      fs.mkdirSync(projectFolder, { recursive: true });

      db.query(
        "INSERT INTO project (project_name, project_image) VALUES (?, ?)",
        [projectName, projectImage],
        (err, insertResult) => {
          if (err) {
            console.error("Erreur lors de l'ajout du projet :", err);
            if (req.file) fs.unlinkSync(req.file.path);
            return res
              .status(500)
              .json({ error: "Erreur lors de l'ajout du projet." });
          }

          const newProjectId =
            insertResult && insertResult.insertId
              ? insertResult.insertId
              : null;
          if (!newProjectId) {
            return res.status(500).json({
              error: "Impossible de récupérer l'ID du nouveau projet.",
            });
          }

          db.query(
            "SELECT * FROM project WHERE id = ?",
            [newProjectId],
            (err, newProjectResults) => {
              if (err) {
                console.error(
                  "Erreur lors de la récupération du nouveau projet :",
                  err
                );
                return res.status(500).json({
                  error: "Erreur lors de la récupération du nouveau projet.",
                });
              }
              const newProject = newProjectResults[0];
              logger.info(
                `Project created: ID=${newProject.id}, Name="${newProject.project_name}", Image Path="${newProject.project_image}", Created At=${newProject.created_at}`
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
    if (err) return res.status(500).json({ error: "Erreur serveur" });
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
      if (err) return res.status(500).json({ error: "Erreur serveur" });
      if (!results || results.length === 0)
        return res.status(404).json({ error: "Projet introuvable." });
      res.status(200).json(results[0]);
    }
  );
});

// Update project - keep existing name/image when not provided
router.put("/:id", upload.single("projectImage"), (req, res) => {
  const projectId = req.params.id;
  let { projectName } = req.body;
  let newProjectImage = req.file ? req.file.path.replace(/\\/g, "/") : null;

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: "Erreur transaction." });

    // Check duplicate name (only if provided)
    const checkNameQuery =
      "SELECT 1 FROM project WHERE project_name = ? AND id != ?";
    db.query(checkNameQuery, [projectName || "", projectId], (err, results) => {
      if (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        return db.rollback(() =>
          res
            .status(500)
            .json({ error: "Erreur lors de la vérification du nom du projet." })
        );
      }
      if (projectName && results && results.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return db.rollback(() =>
          res.status(400).json({ error: "Ce nom de projet existe déjà." })
        );
      }

      // Fetch current project
      db.query(
        "SELECT project_name, project_image, updated_at FROM project WHERE id = ?",
        [projectId],
        (err, rows) => {
          if (err || !rows || rows.length === 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return db.rollback(() =>
              res
                .status(err ? 500 : 404)
                .json({ error: err ? err.message : "Projet introuvable." })
            );
          }

          const current = rows[0];
          const currentProjectName = current.project_name;
          const dbProjectImage = current.project_image;

          const finalName =
            projectName && projectName.trim() !== ""
              ? projectName.trim()
              : currentProjectName;

          // If a new image was uploaded, use it; otherwise keep existing image
          let finalImage = dbProjectImage;
          if (newProjectImage) {
            finalImage = newProjectImage;
          }

          const oldFolderPath = path.join("uploads", currentProjectName);
          const newFolderPath = path.join("uploads", finalName);

          // Function to update file paths in database when project name changes
          const updateFilePaths = (oldName, newName, callback) => {
            // Get all sections for this project
            db.query(
              "SELECT id FROM section WHERE project_id = ?",
              [projectId],
              (err, sections) => {
                if (err || !sections || sections.length === 0) {
                  return callback(); // No sections, continue
                }

                const sectionIds = sections.map((s) => s.id);

                // Update path_file and path_pdf for all files in these sections
                const updateSql = `
                  UPDATE file 
                  SET 
                    path_file = REPLACE(path_file, ?, ?),
                    path_pdf = REPLACE(path_pdf, ?, ?)
                  WHERE section_id IN (?)
                `;

                const oldPathPart = `uploads/${oldName}/`;
                const newPathPart = `uploads/${newName}/`;

                db.query(
                  updateSql,
                  [
                    oldPathPart,
                    newPathPart,
                    oldPathPart,
                    newPathPart,
                    sectionIds,
                  ],
                  (err, result) => {
                    if (err) {
                      console.error("Error updating file paths:", err);
                    } else if (result && result.affectedRows > 0) {
                      logger.info(
                        `Updated ${result.affectedRows} file paths from "${oldName}" to "${newName}"`
                      );
                    }
                    callback();
                  }
                );
              }
            );
          };

          const continueUpdate = () => {
            const sql =
              "UPDATE project SET project_name = ?, project_image = ? WHERE id = ?";
            db.query(sql, [finalName, finalImage, projectId], (err) => {
              if (err) {
                if (req.file) fs.unlinkSync(req.file.path);
                return db.rollback(() =>
                  res.status(500).json({ error: err.message })
                );
              }

              db.commit((err) => {
                if (err)
                  return res.status(500).json({ error: "Erreur commit." });

                db.query(
                  "SELECT * FROM project WHERE id = ?",
                  [projectId],
                  (err, updatedRows) => {
                    if (err)
                      return res.status(500).json({ error: err.message });
                    const updatedProject = updatedRows[0];

                    // Delete old image file if replaced by new upload
                    if (newProjectImage && dbProjectImage) {
                      const fullOldImagePath = path.join(
                        "uploads",
                        "project_img",
                        dbProjectImage.substring(
                          dbProjectImage.lastIndexOf("/") + 1
                        )
                      );
                      fs.access(fullOldImagePath, (err) => {
                        if (!err) {
                          fs.unlink(fullOldImagePath, (err) => {
                            if (err)
                              console.error(
                                "Erreur suppression ancienne image :",
                                err
                              );
                          });
                        }
                      });
                    }

                    // Log changes
                    if (currentProjectName !== updatedProject.project_name) {
                      logger.info(
                        `Project name changed - Old: "${currentProjectName}", New: "${updatedProject.project_name}", Updated at: ${updatedProject.updated_at}`
                      );
                    }
                    if (dbProjectImage !== updatedProject.project_image) {
                      logger.info(
                        `Project image changed - Old: "${dbProjectImage}", New: "${updatedProject.project_image}", Updated at: ${updatedProject.updated_at}`
                      );
                    }

                    return res.status(200).json(updatedProject);
                  }
                );
              });
            });
          };

          // If name changed, try rename folder and adjust image path if needed
          if (finalName !== currentProjectName) {
            fs.access(oldFolderPath, (err) => {
              if (err) {
                // If old folder doesn't exist, still update file paths in DB then continue
                updateFilePaths(currentProjectName, finalName, () => {
                  continueUpdate();
                });
                return;
              }
              fs.rename(oldFolderPath, newFolderPath, (err) => {
                if (err) {
                  // ignore rename failure, but still try to update DB paths
                  updateFilePaths(currentProjectName, finalName, () => {
                    continueUpdate();
                  });
                  return;
                }
                // If project image contains old folder name, update stored path
                if (
                  dbProjectImage &&
                  dbProjectImage.includes(currentProjectName) &&
                  !newProjectImage
                ) {
                  finalImage = dbProjectImage.replace(
                    currentProjectName,
                    finalName
                  );
                }
                // Update all file paths in database
                updateFilePaths(currentProjectName, finalName, () => {
                  continueUpdate();
                });
              });
            });
          } else {
            continueUpdate();
          }
        }
      );
    });
  });
});

// DELETE route (Corrected to use callbacks)
router.delete("/:id", (req, res) => {
  const projectId = req.params.id;

  db.query(
    "SELECT project_name, project_image FROM project WHERE id = ?",
    [projectId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: "Error retrieving project." });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Project not found." });
      }

      const projectName = results[0].project_name;
      const projectImage = results[0].project_image;
      const projectFolder = path.join("uploads", projectName);

      // Compute safe image path to delete (basename supports URLs and relative paths)
      let projectImageToDelete = null;
      try {
        if (projectImage && typeof projectImage === "string") {
          const imageBase = path.basename(projectImage);
          if (imageBase) {
            projectImageToDelete = path.join(
              __dirname,
              "..",
              "uploads",
              "project_img",
              imageBase
            );
          }
        }
      } catch (e) {
        projectImageToDelete = null;
      }

      // Nouvelle requête pour récupérer les informations du projet avant la suppression
      db.query(
        "SELECT id, project_name, updated_at FROM project WHERE id = ?",
        [projectId],
        (err, projectResults) => {
          if (err) {
            console.error("Error retrieving project:", err);
            return res.status(500).json({
              error: "Error retrieving project.",
            });
          }

          if (projectResults.length > 0) {
            const project = projectResults[0];
            logger.info(
              `Project deleted: ID=${project.id}, Name="${project.project_name}", Deleted At=${project.updated_at}`
            );
          } else {
            logger.info(`Project with ID ${projectId} not found.`);
            return res.status(404).json({ error: "Project not found." });
          }

          // Suppression du projet après la journalisation
          db.query("DELETE FROM project WHERE id = ?", [projectId], (err) => {
            if (err) {
              return res.status(500).json({ error: "Error deleting project." });
            }

            fs.access(projectFolder, (err) => {
              if (!err) {
                fs.rm(projectFolder, { recursive: true }, (err) => {
                  if (err) {
                    console.error("Error deleting folder:", err);
                  } else {
                    logger.info("Folder deleted:", projectFolder);
                  }
                });
              } else {
                logger.info(
                  "Folder does not exist or has already been deleted:",
                  projectFolder
                );
              }
            });

            if (projectImageToDelete) {
              fs.access(projectImageToDelete, (err) => {
                if (!err) {
                  fs.unlink(projectImageToDelete, (err) => {
                    if (err) {
                      console.error("Error deleting image:", err);
                    } else {
                      logger.info("Image deleted:", projectImageToDelete);
                    }
                  });
                } else {
                  logger.info(
                    "Image does not exist or has already been deleted:",
                    projectImageToDelete
                  );
                }
              });
            }

            return res.status(204).json();
          });
        }
      );
    }
  );
});

router.get("/export-project-files/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const [project] = await db
      .promise()
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    const projectFolder = path.join(__dirname, "..", "uploads", projectName);

    if (!fs.existsSync(projectFolder)) {
      return res.status(404).json({ error: "Project folder not found." });
    }

    // Récupérer tous les chemins de fichiers pour le projet
    const [files] = await db.promise().query(
      `
        SELECT file.path_file
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

    for (const file of files) {
      const filePath = path.join(__dirname, "..", file.path_file);
      if (fs.existsSync(filePath)) {
        const relativePath = path.relative(projectFolder, filePath);
        zip.addLocalFile(filePath, path.dirname(relativePath));
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

    // Ajout du message de journalisation
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
      .query("SELECT project_name FROM project WHERE id = ?", [projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ error: "Project not found." });
    }
    const projectName = project[0].project_name;

    const projectFolder = path.join(__dirname, "..", "uploads", projectName);

    if (!fs.existsSync(projectFolder)) {
      return res.status(404).json({ error: "Project folder not found." });
    }

    // Récupérer tous les chemins de fichiers QR pour le projet
    const [files] = await db.promise().query(
      `
        SELECT file.path_pdf
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

    for (const file of files) {
      // Normaliser le chemin pour Windows (remplacer / par \)
      const normalizedPath = file.path_pdf.split("/").join(path.sep);
      const filePath = path.join(__dirname, "..", normalizedPath);
      if (fs.existsSync(filePath)) {
        // Garder la structure des dossiers dans le ZIP
        const relativePath = path.relative(projectFolder, filePath);
        zip.addLocalFile(filePath, path.dirname(relativePath));
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
    console.error("Erreur lors de la recherche de fichiers :", err);
    res.status(500).json({ error: "Erreur lors de la recherche de fichiers." });
  }
});

module.exports = router;
