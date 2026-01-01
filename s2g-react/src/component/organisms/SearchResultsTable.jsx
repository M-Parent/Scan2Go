import { useState, useEffect, useRef, useCallback } from "react";
import { ModalEditFile } from "../molecules/modal/ModalEditFile";
import { Modal } from "../molecules/modal/Modal";

import QRCode from "qrcode";

import API_BASE_URL from "../../api"; // Import your API URL

export function SearchResultsTable({
  sectionFiles,
  setSectionFiles,
  section,
  fetchSectionFiles,
  project,
  setSelectedSection,
}) {
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [fileTags, setFileTags] = useState({});
  const [qrCodeUrl, setQrCodeUrl] = useState(null); // State pour l'URL du QR code
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
      await navigator.clipboard.writeText(url);
      setCopyFeedback("copied");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
      setCopyFeedback("failed");
      setTimeout(() => setCopyFeedback(null), 2000);
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

  const handleDownloadFile = async (fileUrl, fileName) => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading file:", error);
      alert("Failed to download file.");
    }
  };

  // Fetch the tags of all files in sectionFiles
  const fetchFileTagsForSection = useCallback(async () => {
    if (sectionFiles[section.id]) {
      for (const file of sectionFiles[section.id]) {
        await fetchFileTags(file.id);
      }
    }
  }, [sectionFiles, section.id]);

  // Function to fetch tags for a specific file
  const fetchFileTags = async (fileId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch tags");
      }
      const tags = await response.json();
      setFileTags((prevTags) => ({
        ...prevTags,
        [fileId]: tags,
      }));
      return tags;
    } catch (error) {
      console.error("Error fetching file tags:", error);
      return [];
    }
  };

  useEffect(() => {
    fetchFileTagsForSection(); // Call this function to fetch the tags on component mount
  }, [sectionFiles, section.id, fetchFileTagsForSection]);

  const handleFileUploaded = async () => {
    await fetchSectionFiles(section.id);
    if (selectedFileToEdit) {
      fetchFileTags(selectedFileToEdit.id);
    }
  };

  const handleDeleteFile = async (fileId, sectionId) => {
    const confirmDelete = window.confirm(
      "Êtes-vous sûr de vouloir supprimer ce fichier ?"
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

  const handleToggleQrCodePopup = (
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
      return;
    }

    const generateQrCode = async () => {
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

    generateQrCode();
  };

  return (
    <div>
      <table className="w-full">
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
              <td className="px-6 py-4 text-lg text-nowrap">{file.name}</td>
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
                      className=" py-6 px-12 Glassmorphgisme-noHover"
                    >
                      <p className="text-white text-2xl pb-6">
                        {currentProjectName} / {currentSectionName} /{" "}
                        <span className="text-red-500">{currentFileName}</span>
                      </p>
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
                    onClick={() =>
                      handleDownloadFile(file.url_qr_code, file.name)
                    }
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
    </div>
  );
}
