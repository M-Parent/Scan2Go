import { useState, useEffect, useRef } from "react";
import { ModalEditFile } from "../molecules/modal/ModalEditFile";
import { Modal } from "../molecules/modal/Modal";

import QRCode from "qrcode";

import API_BASE_URL from "../../api"; // Import your API URL

export function Table({
  sectionFiles,
  setSectionFiles,
  section,
  fetchSectionFiles,
  project,
  setSelectedSection,
}) {
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [fileTags, setFileTags] = useState({});
  const [qrCodeUrl, setQrCodeUrl] = useState(null); // State for QR code URL
  const [showQrCodePopup, setShowQrCodePopup] = useState(false);
  const [currentFileName, setCurrentFileName] = useState("");
  const [currentSectionName, setCurrentSectionName] = useState("");
  const [currentProjectName, setCurrentProjectName] = useState("");
  const popupRef = useRef(null);
  const iconRef = useRef(null);
  const [showModalEditFile, setShowModalEditFile] = useState(false);
  const [selectedFileToEdit, setSelectedFileToEdit] = useState(null);
  const [selectedSection, setSelectedSectionLocal] = useState(null);

  const handleCopyQRCodeURL = async (url) => {
    try {
      // navigator.clipboard only works on HTTPS or localhost
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for HTTP: use a temporary textarea
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopyFeedback("copied"); // Trigger feedback
      setTimeout(() => setCopyFeedback(null), 2000); // Hide feedback after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
      setCopyFeedback("failed"); // Trigger error feedback
      setTimeout(() => setCopyFeedback(null), 2000); // Hide feedback after 2 seconds
    }
  };

  const handleDownloadFile = async (fileId, fileName) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/download/${fileId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.zip`; // Using the provided fileName
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove(); // Cleanup the anchor element
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file.");
    }
  };

  const handleEditFile = (file) => {
    setSelectedFileToEdit(file);
    setSelectedSectionLocal(section);
    setShowModalEditFile(true);
  };

  const handleCloseModalEditFile = () => {
    setShowModalEditFile(false);
    setSelectedFileToEdit(null);
  };

  const fetchFileTags = async (fileId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tags");
      }
      const tags = await response.json();
      return tags;
    } catch (error) {
      console.error("Error fetching file tags:", error);
      return [];
    }
  };

  useEffect(() => {
    const fetchAllFileTags = async () => {
      if (sectionFiles && sectionFiles[section.id] && section.id) {
        const tagsPromises = sectionFiles[section.id].map(async (file) => {
          const tags = await fetchFileTags(file.id);
          return { fileId: file.id, tags };
        });

        const tagsResults = await Promise.all(tagsPromises);

        setFileTags((prevTags) => {
          const updatedTags = { ...prevTags };
          tagsResults.forEach(({ fileId, tags }) => {
            updatedTags[fileId] = tags;
          });
          return updatedTags;
        });
      }
    };

    fetchAllFileTags();
  }, [sectionFiles, section.id]);

  const handleFileUploaded = async () => {
    await fetchSectionFiles(section.id);
    // Update tags after file update
    if (selectedFileToEdit) {
      fetchFileTags(selectedFileToEdit.id);
    }
    window.location.reload();
  };

  const handleDeleteFile = async (fileId, sectionId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this file?"
    );

    if (confirmDelete) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/uploadFile/files/${fileId}`,
          {
            method: "DELETE",
          }
        );

        if (response.ok) {
          // Update sectionFiles state to remove the file
          setSectionFiles((prevFiles) => {
            const updatedFiles = { ...prevFiles };
            if (updatedFiles[sectionId]) {
              updatedFiles[sectionId] = updatedFiles[sectionId].filter(
                (file) => file.id !== fileId
              );
            }
            return updatedFiles;
          });
        } else {
          console.error("Failed to delete file:", response.status);
          const errorData = await response.json();
          alert(errorData.error || "Failed to delete file");
        }
      } catch (error) {
        console.error("Connection error:", error);
        alert("A network error occurred while deleting the file.");
      }
    }
  };

  useEffect(() => {
    const fetchAllFileTags = async () => {
      if (sectionFiles[section.id]) {
        const tagsPromises = sectionFiles[section.id].map(async (file) => {
          const tags = await fetchFileTags(file.id);
          return { fileId: file.id, tags };
        });

        const tagsResults = await Promise.all(tagsPromises);

        setFileTags((prevTags) => {
          const updatedTags = { ...prevTags };
          tagsResults.forEach(({ fileId, tags }) => {
            updatedTags[fileId] = tags;
          });
          return updatedTags;
        });
      }
    };

    fetchAllFileTags();
  }, [sectionFiles, section.id]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      console.log("Click detecter", event.target);
      if (showQrCodePopup) {
        setShowQrCodePopup(false);
      }
    };

    document.body.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.body.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showQrCodePopup]);

  const handleToggleQrCodePopup = async (
    url,
    fileName,
    sectionName,
    projectName,
    event
  ) => {
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    if (showQrCodePopup) {
      setShowQrCodePopup(false);
      setQrCodeUrl(null); // Reset QR code URL
      return;
    }
    if (!url) {
      return;
    }
    try {
      const generatedQrCodeUrl = await QRCode.toDataURL(url);
      setQrCodeUrl(generatedQrCodeUrl);
      setCurrentFileName(fileName);
      setCurrentSectionName(sectionName);
      setCurrentProjectName(projectName);
      setShowQrCodePopup(true);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  return (
    <>
      <table className=" w-full ">
        <thead className="text-xs uppercase border-b">
          <tr>
            <td className="px-6 py-3">Name</td>
            <th scope="col" className="px-6 py-3 text-nowrap">
              QR Code
            </th>
            <th scope="col" className="px-6 py-3">
              Share
            </th>
            <th scope="col" className="px-6 py-3">
              Tag
            </th>
            <th scope="col" className="flex justify-end pe-4 sm:pe-12 py-3">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {sectionFiles[section.id]?.map((file) => (
            <tr
              key={file.id}
              className="hover:border hover:bg-white/20 duration-300 transition ease-in-out"
            >
              <td className="px-6 py-4 text-lg text-nowrap">
                {file.name} {/* Display file name */}
              </td>
              <th className="px-6 py-4 relative">
                <button
                  onClick={(event) =>
                    handleToggleQrCodePopup(
                      file.url_qr_code,
                      file.name,
                      section.section_name,
                      project.project_name,
                      event
                    )
                  }
                  ref={iconRef}
                >
                  <img
                    src="/img/icon/qr-code-scan.svg"
                    alt="Qr Code File"
                    width={24}
                  />
                </button>
                {showQrCodePopup && qrCodeUrl && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center">
                    <div
                      ref={popupRef}
                      className=" py-6 px-12 Glassmorphgisme-noHover "
                    >
                      <p className="text-white text-2xl pb-6">
                        {currentProjectName} / {currentSectionName} /{" "}
                        <span className="text-red-500">{currentFileName}</span>
                      </p>{" "}
                      {/* Using currentFileName */}
                      <img
                        className="bg-transparent rounded-2xl"
                        src={qrCodeUrl}
                        alt="QR Code"
                        width={350}
                        height={350}
                      />
                    </div>
                  </div>
                )}
              </th>
              <th className="px-6 py-4">
                <button onClick={() => handleCopyQRCodeURL(file.url_qr_code)}>
                  <img src="/img/icon/share.svg" alt="Share File" width={24} />
                </button>
              </th>
              <th className="sm:flex sm:justify-center py-4">
                {/* Display tags here */}
                <div>
                  {fileTags[file.id]?.map((tag, index) => (
                    <span
                      key={index}
                      className="Glassmorphgisme-noHover text-sm px-2 py-0.5 me-1.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </th>
              <th className="px-1 sm:px-6 sm:py-4">
                <div className="flex justify-end ">
                  <button
                    onClick={() => handleDownloadFile(file.id, file.name)}
                  >
                    <img
                      className="me-2"
                      src="/img/icon/file-arrow-down.svg"
                      alt="Download File"
                      width={24}
                    />
                  </button>
                  <button onClick={() => handleEditFile(file)}>
                    <img
                      className="me-2"
                      src="/img/icon/pencil-square.svg"
                      alt="Edit File"
                      width={24}
                    />
                  </button>
                  <button onClick={() => handleDeleteFile(file.id, section.id)}>
                    <img
                      src="/img/icon/trash.svg"
                      alt="Delete File"
                      width={24}
                    />
                  </button>
                </div>
              </th>
            </tr>
          ))}
        </tbody>
        {copyFeedback === "copied" && (
          <div className="fixed top-48 right-0 transform -translate-x-12 bg-green-500 text-white p-3 rounded-md transition-opacity duration-2000 opacity-100">
            URL copied to clipboard!
          </div>
        )}
        {copyFeedback === "failed" && (
          <div className="fixed top-48 right-0 transform -translate-x-12 bg-red-500 text-white p-3 rounded-md transition-opacity duration-2000 opacity-100">
            Failed to copy URL.
          </div>
        )}
      </table>
      <Modal isVisible={showModalEditFile}>
        {selectedFileToEdit && (
          <ModalEditFile
            onCloseModalEditFile={handleCloseModalEditFile}
            projectName={project.project_name}
            sectionName={selectedSection.section_name}
            sectionId={selectedSection.id}
            onFileUploaded={handleFileUploaded}
            fileId={selectedFileToEdit.id}
            oldFilePath={selectedFileToEdit.path_file}
            file={selectedFileToEdit}
          />
        )}
      </Modal>
    </>
  );
}
