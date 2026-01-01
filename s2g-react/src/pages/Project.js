import { ModalAddSection } from "../component/molecules/modal/ModalAddSection";
import { ModalEditSection } from "../component/molecules/modal/ModalEditSection";
import { ModalEditProject } from "../component/molecules/modal/ModalEditProject";
import { Modal } from "../component/molecules/modal/Modal";
import { useState, useEffect, useRef, useCallback } from "react";
import { AddGlass } from "../component/molecules/glass/AddGlass";
import { Table } from "../component/organisms/table";
import { SearchBarGlass } from "../component/molecules/glass/SearchBarGlass";
import { ModalAddFile } from "../component/molecules/modal/ModalAddFile";
import { useParams, useNavigate } from "react-router-dom";
import API_BASE_URL from "../api";
import { SearchResultsTable } from "../component/organisms/SearchResultsTable";
import { DropdownMenu } from "../component/molecules/DropdownMenu";

export const exportProjectFiles = async (projectId, projectName) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/export-project-files/${projectId}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "project"}-files.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export project failed", error);
    alert("Failed to export project files.");
  }
};

export const exportProjectQrCodes = async (projectId, projectName) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/projects/export-project-qr/${projectId}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName || "project"}-qrcodes.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export project QR codes failed", error);
    alert("Failed to export project QR codes.");
  }
};

export function Project() {
  const [showModalEditSection, setShowModalEditSection] = useState(false);
  const [sectionToEdit, setSectionToEdit] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);

  const [totalFileSize, setTotalFileSize] = useState(0);
  const [sectionFiles, setSectionFiles] = useState({});

  const [searchResults, setSearchResults] = useState([]);
  const [noResultsFound, setNoResultsFound] = useState(false);
  const [fileTagsMap, setFileTagsMap] = useState({});

  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [projectToEdit, setProjectToEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sections, setSections] = useState([]);
  const [sectionCount, setSectionCount] = useState(0);
  const [sectionCollapse, setSectionCollapse] = useState({});

  const [showDropdown, setShowDropdown] = useState(false);
  const [showDropdown2, setShowDropdown2] = useState({});

  const dropdownRef = useRef(null);
  const dropdownRef2 = useRef({});

  const [showModalAddSection, setShowModalAddSection] = useState(false);
  const [showModalAddFile, setShowModalAddFile] = useState(false);
  const [showModalEditProject, setShowModalEditProject] = useState(false);

  const [totalFilesCount, setTotalFilesCount] = useState(0);

  const handleSearch = async (searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) {
      setSearchResults([]);
      setNoResultsFound(false);
      return;
    }

    try {
      const term = searchTerm.trim().toLowerCase();
      const results = [];

      const getTagsForFile = async (fileId) => {
        if (fileTagsMap[fileId]) return fileTagsMap[fileId];
        try {
          const resp = await fetch(
            `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags`
          );
          if (!resp.ok) return [];
          const tags = await resp.json();
          setFileTagsMap((prev) => ({ ...prev, [fileId]: tags }));
          return tags;
        } catch (e) {
          return [];
        }
      };

      // Parcourir toutes les sections
      for (const section of sections) {
        const sectionId = section.id;
        const sectionName = section.section_name || "";
        const sectionNameLower = sectionName.toLowerCase();

        // Vérifier si le nom de la section correspond à la recherche
        const sectionMatches = sectionNameLower.includes(term);

        // Récupérer les fichiers de cette section
        const files = sectionFiles[sectionId] || [];

        for (const file of files) {
          const fileName = (file.name || "").toString().toLowerCase();
          let matched = false;

          // Match si le nom de fichier correspond
          if (fileName.includes(term)) {
            matched = true;
          }

          // Match si le nom de section correspond
          if (sectionMatches) {
            matched = true;
          }

          // Match si un tag correspond
          if (!matched) {
            const tags = await getTagsForFile(file.id);
            if (Array.isArray(tags)) {
              const tagMatch = tags.some((t) =>
                (t || "").toString().toLowerCase().includes(term)
              );
              if (tagMatch) matched = true;
            }
          }

          if (matched) {
            results.push({
              ...file,
              section_name: sectionName,
              project_name: project ? project.project_name : "",
              project_id: project ? project.id : null,
              section_id: sectionId,
            });
          }
        }
      }

      setSearchResults(results);
      setNoResultsFound(results.length === 0);
    } catch (error) {
      console.error("Erreur lors de la recherche locale :", error);
      setSearchResults([]);
      setNoResultsFound(true);
    }
  };

  const fetchSectionFiles = async (sectionId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/files/${sectionId}`
      );
      if (response.ok) {
        const files = await response.json();
        setSectionFiles((prevFiles) => ({
          ...prevFiles,
          [sectionId]: files,
        }));
      } else {
        console.error("Failed to fetch files:", response.status);
      }
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  };

  const exportSection = async (sectionId, sectionName) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sections/export/${sectionId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sectionName}_Section_File.zip`; // Utilisation de sectionName ici
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Error exporting section:", error);
      alert("Failed to export section.");
    }
  };

  const exportQrCodes = async (sectionId, sectionName) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/sections/export-qr/${sectionId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sectionName}Section_Qr_Code.zip`; // Nom du fichier ZIP modifié
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Error exporting QR codes:", error);
      alert("Failed to export QR codes.");
    }
  };

  const calculateTotalFileSize = useCallback(() => {
    let totalSize = 0;
    Object.values(sectionFiles).forEach((files) => {
      if (files) {
        files.forEach((file) => {
          totalSize += file.size || 0;
        });
      }
    });
    setTotalFileSize(totalSize);
  }, [sectionFiles]); // sectionFiles est la seule dépendance de calculateTotalFileSize

  useEffect(() => {
    calculateTotalFileSize();
  }, [calculateTotalFileSize]);

  useEffect(() => {
    sections.forEach((section) => {
      fetchSectionFiles(section.id);
    });
  }, [sections]);

  useEffect(() => {
    const updateTotalFilesCount = () => {
      let count = 0;
      Object.values(sectionFiles).forEach((files) => {
        if (files) {
          count += files.length;
        }
      });
      setTotalFilesCount(count);
    };
    updateTotalFilesCount();
  }, [sectionFiles]);

  useEffect(() => {
    // Récupérer les fichiers pour chaque section
    sections.forEach((section) => {
      fetchSectionFiles(section.id);
    });
  }, [sections]);

  const handleEditSection = (section) => {
    setSectionToEdit(section);
    setShowModalEditSection(true);
    setShowDropdown2((prevState) => ({
      ...prevState,
      [section.id]: false, // Close the dropdown for this section
    }));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef2.current) {
        // Check if dropdownRef2.current exists!
        Object.keys(showDropdown2).forEach((sectionId) => {
          const dropdownElement = dropdownRef2.current[sectionId];

          if (
            showDropdown2[sectionId] &&
            dropdownElement &&
            dropdownElement.contains(event.target)
          ) {
            return;
          }

          if (
            showDropdown2[sectionId] &&
            dropdownElement &&
            !dropdownElement.contains(event.target)
          ) {
            setShowDropdown2((prevState) => ({
              ...prevState,
              [sectionId]: false,
            }));
          }
        });
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showDropdown2]);

  const handleCloseModals = () => {
    setShowDropdown(false);
    setShowDropdown2({});
    setShowModalEditProject(false);
    setShowModalAddSection(false);
    setShowModalAddFile(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showDropdown &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showDropdown, showDropdown2]); // Add showDropdown to the dependency array

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/${projectId}`
        );
        if (response.ok) {
          const data = await response.json();
          setProject(data);
        } else {
          setError("Failed to fetch project.");
          console.error("Error fetching project:", response.status);
        }
      } catch (error) {
        setError("A network error occurred.");
        console.error("Connection error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]); // Fetch project on projectId change

  const handleEditProject = () => {
    setProjectToEdit(project); // Set the project to edit in state
    setShowModalEditProject(true);
    setShowDropdown(false); // Close the dropdown
  };

  useEffect(() => {
    const fetchSections = async () => {
      if (projectId) {
        // Only fetch if projectId is available
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/sections/${projectId}`
          );
          if (response.ok) {
            const data = await response.json();
            setSections(data);
            setSectionCount(data.length);
            // Initialize collapse state for each section
            const initialCollapse = {};
            data.forEach((section) => {
              initialCollapse[section.id] = false; // Initially collapsed
            });
            setSectionCollapse(initialCollapse);
          } else {
            console.error("Error fetching sections:", response.status);
            setError("Failed to fetch sections.");
          }
        } catch (error) {
          console.error("Connection error:", error);
          setError("A network error occurred.");
        } finally {
          setLoading(false);
        }
      }
    };

    fetchSections();
  }, [projectId]);

  const handleSectionCollapse = (sectionId) => {
    setSectionCollapse((prevState) => ({
      ...prevState,
      [sectionId]: !prevState[sectionId], // Toggle collapse state
    }));
  };

  const handleProjectUpdated = async (updatedProject) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${updatedProject.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedProject),
        }
      );

      if (response.ok) {
        setProject(updatedProject); // Update the project in the state
        setShowModalEditProject(false);
      } else {
        console.error("Error updating project:", response.status);
        const errorData = await response.json();
        alert(errorData.error || "Failed to update project");
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert("A network error occurred while updating the project.");
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!project) {
    return <div>Project not found.</div>;
  }

  const handleBackClick = () => {
    navigate("/"); // Navigate back to Home
  };

  const handleDeleteProject = async (projectId) => {
    const confirmDelete = window.confirm(
      "Êtes-vous sûr de vouloir supprimer ce projet ?"
    );
    if (confirmDelete) {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          console.log("Projet supprimé avec succès");
          navigate("/"); // Redirigez vers la page d'accueil
        } else {
          console.error(
            "Erreur lors de la suppression du projet:",
            response.status
          );
          const errorData = await response.json();
          alert(errorData.error || "Échec de la suppression du projet");
        }
      } catch (error) {
        console.error("Erreur de connexion:", error);
        alert(
          "Une erreur réseau s'est produite lors de la suppression du projet."
        );
      }
    }
  };

  const handleDeleteSection = async (sectionId) => {
    const confirmDelete = window.confirm(
      "Êtes-vous sûr de vouloir supprimer cette section ?"
    );

    if (confirmDelete) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/sections/${sectionId}`,
          {
            method: "DELETE",
          }
        );

        if (response.ok) {
          console.log("Section deleted successfully");

          // 1. Filter the sections array:
          const updatedSections = sections.filter(
            (section) => section.id !== sectionId
          );

          // 2. Update BOTH sections and sectionCount:
          setSections(updatedSections);
          setSectionCount(updatedSections.length); // Crucial update!

          setShowDropdown2((prevState) => ({
            ...prevState,
            [sectionId]: false, // Close the dropdown for this section
          }));
        } else {
          console.error("Error deleting section:", response.status);
          const errorData = await response.json();
          alert(errorData.error || "Failed to delete section");
        }
      } catch (error) {
        console.error("Connection error:", error);
        alert("A network error occurred while deleting the section.");
      }
    }
  };

  return (
    <div>
      {/* Nav back home + Title project */}
      <div className="flex p-6">
        <div className="me-auto">
          <button onClick={handleBackClick}>
            {" "}
            {/* Use a button for navigation */}
            <img
              className="Glassmorphgisme p-2"
              src="../img/Logo1picPNGZoom.png"
              width={48}
              alt="Logo Scan2Go"
            />
          </button>
        </div>
        <div className="flex me-auto pe-12 items-center">
          <p className="font-bungee text-4xl text-white">
            {project.project_name}
          </p>
        </div>
      </div>
      {/* Header */}

      <div className="md:flex justify-center border-b-white/40 border-b pb-5 lg:mx-48 mx-12">
        <div className="flex justify-center pb-5 md:pb-0">
          <img
            className="rounded-3xl md:w-56"
            src={`${API_BASE_URL}/${project.project_image}`}
            alt={project.project_name}
          />
        </div>
        <div className="flex flex-col justify-around text-white w-full ps-5">
          <div className="flex">
            <p className="me-auto">
              Total Section:{" "}
              <span className="font-bold ms-2">{sectionCount}</span>
            </p>
            <DropdownMenu
              trigger={
                <img
                  src="/img/icon/three-dots-vertical.svg"
                  alt="dots details icon"
                  className="cursor-pointer"
                />
              }
              items={[
                { label: "Edit", onClick: handleEditProject },
                {
                  label: "Export Project",
                  onClick: () =>
                    exportProjectFiles(project.id, project.project_name),
                },
                {
                  label: "Export QR code",
                  onClick: () =>
                    exportProjectQrCodes(project.id, project.project_name),
                },
                {
                  label: "Delete",
                  onClick: () => handleDeleteProject(project.id),
                  danger: true,
                },
              ]}
            />
          </div>
          <div className="pb-2.5 ">
            Total Uploaded File:{" "}
            <span className="font-bold ms-2">{totalFilesCount}</span>
          </div>
          <div>
            Total Space use:{" "}
            <span className="font-bold ms-2">
              {(totalFileSize / (1024 * 1024)).toFixed(2)} Mb
            </span>
          </div>
        </div>
      </div>
      {sections.length === 0 ? (
        <>
          {/* AddGlass default view */}
          <div className="flex justify-center mt-16 lg:mt-48 md:mt-32 overflow-hidden w-full">
            <button
              className="transition transform hover:scale-105 hover:duration-700 hover:ease-in-out"
              onClick={() => setShowModalAddSection(true)}
            >
              <AddGlass />
            </button>
          </div>
          <Modal isVisible={showModalAddSection}>
            <ModalAddSection
              projectId={projectId}
              onCloseModalAddSection={handleCloseModals}
            />
          </Modal>

          {/* Modal Edit */}
          <Modal isVisible={showModalEditProject}>
            {projectToEdit && ( // Conditionally render the modal
              <ModalEditProject
                project={projectToEdit}
                onCloseModalEditProject={handleCloseModals}
                onProjectUpdated={handleProjectUpdated} // Pass the update handler
              />
            )}
          </Modal>
        </>
      ) : (
        <>
          {/* Search + Add */}
          <div className="lg:mx-48 mx-12 text-white sm:flex my-4">
            <div className="md:ms-auto ms-0 md:ps-24">
              <SearchBarGlass onSearch={handleSearch} projectId={projectId} />
            </div>
            <div className="sm:ms-auto flex justify-center mt-5 sm:mt-0">
              <button
                onClick={() => setShowModalAddSection(true)}
                className="flex Glassmorphgisme px-3 py-1.5 font-bungee me-auto"
              >
                <img
                  src="/img/icon/plus-circle.svg"
                  alt="Plus icon"
                  width={24}
                />
                <div className="flex items-center ms-1.5">Add</div>
              </button>
            </div>
          </div>

          {/* Affichage conditionnel des résultats de recherche groupés par section */}
          {searchResults.length > 0 && (
            <div className="overflow-y-auto h-[530px] lg:mx-40 me-4 scrollbar-custom">
              <div className="lg:mx-12 mx-12 mt-4 text-white">
                {/* Grouper les résultats par section */}
                {Object.entries(
                  searchResults.reduce((acc, file) => {
                    const secId = file.section_id;
                    if (!acc[secId]) {
                      acc[secId] = {
                        section_name: file.section_name,
                        section_id: secId,
                        files: [],
                      };
                    }
                    acc[secId].files.push(file);
                    return acc;
                  }, {})
                ).map(([secId, group]) => (
                  <div key={secId} className="mb-8">
                    <p className="text-2xl mb-3 border-b border-white/30 pb-2">
                      {group.section_name} :
                    </p>
                    <SearchResultsTable
                      sectionFiles={{ [secId]: group.files }}
                      setSectionFiles={setSectionFiles}
                      section={{
                        id: secId,
                        section_name: group.section_name,
                      }}
                      project={{
                        id: project?.id,
                        project_name: project?.project_name,
                      }}
                      fetchSectionFiles={fetchSectionFiles}
                      setSelectedSection={setSelectedSection}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message si aucun résultat n'est trouvé */}
          {noResultsFound && (
            <div className="lg:mx-48 mx-12 text-white text-center mt-4">
              Aucune section, tags ou fichier trouvé avec cette recherche dans
              ce projet.
            </div>
          )}

          {/* Section - masquer si des résultats de recherche sont affichés */}
          {searchResults.length === 0 && !noResultsFound && (
            <div className="overflow-y-auto h-[530px] lg:me-40 me-4 scrollbar-custom">
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="relative lg:ms-52 lg:me-6 mx-12 text-white my-16 "
                >
                  <div>
                    <div
                      className={`pb-3 duration-100 ${
                        sectionCollapse[section.id]
                      }`}
                      onClick={() => handleSectionCollapse(section.id)}
                    >
                      <button
                        className={`absolute top-[8px] left-[-24px] transition-transform duration-300 ${
                          sectionCollapse[section.id]
                            ? "rotate-0"
                            : "rotate-[-90deg]"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSectionCollapse(section.id);
                        }}
                      >
                        <img
                          src="/img/icon/chevron-down.svg"
                          alt="Chevron-down icon"
                          width={16}
                        />
                      </button>

                      <div className="flex justify-between ">
                        <p className="text-2xl">{section.section_name} :</p>
                        <div className="flex">
                          <button
                            className="Glassmorphgisme py-1.5 px-3"
                            onClick={() => {
                              setSelectedSection(section);
                              setShowModalAddFile(true);
                            }}
                          >
                            <img
                              src="/img/icon/upload.svg"
                              alt="Logo upload file"
                              width={20}
                            />
                          </button>

                          <DropdownMenu
                            trigger={
                              <img
                                className="ps-3.5 cursor-pointer"
                                src="/img/icon/three-dots-vertical.svg"
                                alt="dots details icon"
                              />
                            }
                            items={[
                              {
                                label: "Edit",
                                onClick: () => handleEditSection(section),
                              },
                              {
                                label: "Export Section",
                                onClick: () =>
                                  exportSection(
                                    section.id,
                                    section.section_name
                                  ),
                              },
                              {
                                label: "Export QR code",
                                onClick: () =>
                                  exportQrCodes(
                                    section.id,
                                    section.section_name
                                  ),
                              },
                              {
                                label: "Delete",
                                onClick: () => handleDeleteSection(section.id),
                                danger: true,
                              },
                            ]}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Table section */}
                    <div
                      className={`mt-1.5 mx-1 sm:me-12 transition-all duration-300 ease-in-out ${
                        sectionCollapse[section.id]
                          ? "translate-y-auto opacity-100"
                          : "translate-y-[-20px] opacity-0"
                      }`}
                    >
                      <div
                        className={`mx-1 sm:mx-5 relative w-full ${
                          sectionCollapse[section.id] ? "" : "hidden"
                        }`}
                      >
                        <div className="overflow-x-auto">
                          <Table
                            sectionFiles={sectionFiles}
                            setSectionFiles={setSectionFiles}
                            section={section}
                            project={project} // Ajout de project
                            fetchSectionFiles={fetchSectionFiles} // Ajout de fetchSectionFiles
                            setSelectedSection={setSelectedSection} // Ajout de setSelectedSection
                            handleCloseModals={handleCloseModals} // Ajout de handleCloseModals
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Modal */}
          <Modal isVisible={showModalAddSection}>
            <ModalAddSection
              projectId={projectId}
              onCloseModalAddSection={handleCloseModals}
            />
          </Modal>
          {/* Modal Add File */}
          <Modal isVisible={showModalAddFile}>
            {selectedSection && (
              <ModalAddFile
                onCloseModalAddFile={handleCloseModals}
                projectName={project.project_name}
                sectionName={selectedSection.section_name}
                onFileUploaded={() => {
                  fetchSectionFiles(selectedSection.id); // Appel de la fonction de fetch ici
                }}
                sectionId={selectedSection.id}
              />
            )}
          </Modal>

          <Modal isVisible={showModalEditSection}>
            {sectionToEdit && (
              <ModalEditSection
                section={sectionToEdit} // Pass the section to edit
                onCloseModalEditSection={() => setShowModalEditSection(false)}
                // Add a prop for handling section updates, similar to handleProjectUpdated
                onSectionUpdated={(updatedSection) => {
                  // Implement logic to update the section in the sections state
                  const updatedSections = sections.map((s) =>
                    s.id === updatedSection.id ? updatedSection : s
                  );
                  setSections(updatedSections);
                  setShowModalEditSection(false);
                }}
              />
            )}
          </Modal>
          {/* Modal Edit */}
          <Modal isVisible={showModalEditProject}>
            {projectToEdit && ( // Conditionally render the modal
              <ModalEditProject
                project={projectToEdit}
                onCloseModalEditProject={handleCloseModals}
                onProjectUpdated={handleProjectUpdated} // Pass the update handler
              />
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

export default Project;
