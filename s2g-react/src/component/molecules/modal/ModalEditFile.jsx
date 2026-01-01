import React, { useState, useEffect } from "react";
import { ModalTitle } from "./ModalTitle";
import { ModalFooter } from "./ModalFooter";
import { ModalInputText } from "./ModalInputText";
import API_BASE_URL from "../../../api";

export function ModalEditFile({
  file,
  fileId,
  projectName,
  sectionName,
  sectionId,
  onCloseModalEditFile,
  onFileUploaded,
}) {
  const [fileName, setFileName] = useState(file?.name || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileLabel, setFileLabel] = useState(file?.name || "No file selected");
  const [tags, setTags] = useState([]);
  const [existingTags, setExistingTags] = useState([]);
  const [tagErrors, setTagErrors] = useState({});
  const [fileNameError, setFileNameError] = useState("");

  useEffect(() => {
    setFileName(file?.name || "");
  }, [file]);

  const handleFileNameChange = (event) => {
    setFileName(event.target.value);
    setFileNameError(""); // Clear previous error when typing
  };

  const handleFileChange = (event) => {
    const f = event.target.files[0];
    setSelectedFile(f);
    if (f) {
      setFileLabel(f.name);
      if (f.type && f.type.startsWith("image/")) {
        const url = URL.createObjectURL(f);
        setFilePreview(url);
      } else {
        setFilePreview(null);
      }
    } else {
      setFileLabel(file?.name || "No file selected");
      setFilePreview(null);
    }
  };

  const handleTagChange = (index, event) => {
    const newTag = event.target.value.trim();
    const newTags = [...tags];
    newTags[index] = newTag;
    setTags(newTags);

    // Check for duplicate tags
    const errors = {};
    for (let i = 0; i < newTags.length; i++) {
      if (
        newTags[i] &&
        newTags.filter((tag) => tag === newTags[i]).length > 1
      ) {
        errors[newTags[i]] = "A tag with this name already exists.";
      }
    }
    setTagErrors(errors);
  };

  const handleAddTag = () => {
    if (tags.length >= 5) return;
    if (tags.includes("")) return;
    setTags([...tags, ""]);
  };

  const handleDeleteTag = (index) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);

    // Clear tag errors if a tag is removed
    const newTagErrors = { ...tagErrors };
    delete newTagErrors[tags[index]];
    setTagErrors(newTagErrors);
  };

  useEffect(() => {
    const fetchTags = async () => {
      if (fileId) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags`
          );
          if (response.ok) {
            const tagsData = await response.json();
            setTags(tagsData);
            setExistingTags(tagsData);
          } else {
            console.error("Failed to fetch tags:", response.status);
          }
        } catch (error) {
          console.error("Error fetching tags:", error);
        }
      }
    };
    fetchTags();
  }, [fileId]);

  const checkFileNameExists = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/checkFileName?sectionId=${sectionId}&fileName=${fileName}`
      );
      const data = await response.json();
      if (data.exists && fileName !== file.name) {
        setFileNameError("A file with this name already exists.");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error checking file name:", error);
      return false;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const fileNameExists = await checkFileNameExists();
    if (fileNameExists) {
      return; // Prevent submission if file name exists
    }

    // Check if selected file already exists
    if (selectedFile) {
      try {
        const fileExistsResponse = await fetch(
          `${API_BASE_URL}/api/uploadFile/checkFileExists?projectName=${projectName}&sectionName=${sectionName}&fileName=${fileName}&checkFileName=${selectedFile.name}`
        );

        if (!fileExistsResponse.ok) {
          console.error(
            "Error checking file existence:",
            fileExistsResponse.status,
            fileExistsResponse.statusText
          );
          return; // Prevent submission if there's an error
        }

        const fileExistsData = await fileExistsResponse.json();
        console.log("fileExistsData:", fileExistsData); // Add this line

        if (fileExistsData.exists) {
          alert(`${selectedFile.name} already exists in this folder.`); // Or use a more sophisticated error message
          return; // Prevent submission if file exists
        }
      } catch (error) {
        console.error("Error checking file existence:", error);
        return; // Prevent submission if there's an error checking
      }
    }

    // Rest of your handleSubmit logic...
    const tagsToDelete = existingTags.filter((tag) => !tags.includes(tag));

    if (tagsToDelete.length > 0) {
      try {
        await fetch(
          `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: tagsToDelete }),
          }
        );
      } catch (error) {
        console.error("Error deleting tags:", error);
      }
    }

    const formData = new FormData();
    formData.append("fileName", fileName);
    formData.append("projectName", projectName);
    formData.append("sectionName", sectionName);

    tags.forEach((tag) => {
      formData.append("tags[]", tag);
    });

    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/uploadFile/files/${fileId}`,
        {
          method: "PUT",
          body: formData,
        }
      );

      if (response.ok) {
        const tagsResponse = await fetch(
          `${API_BASE_URL}/api/uploadFile/files/${fileId}/tags`
        );
        if (tagsResponse.ok) {
          const updatedTags = await tagsResponse.json();
          setTags(updatedTags);
        }
        onFileUploaded();
        onCloseModalEditFile();
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <ModalTitle title="Edit File" onClose={onCloseModalEditFile} />
      <div className="flex justify-center pt-3 ">
        <p className="font-bold text-lg">
          {projectName} / {sectionName} /{" "}
          <span className="text-red-500">{fileName}</span>
        </p>
      </div>
      <div className="md:px-14 px-7">
        <ModalInputText
          label="File Name:"
          placeholder="Name file..."
          value={fileName}
          onChange={handleFileNameChange}
        />
        {fileNameError && (
          <p className="text-red-500 text-sm">{fileNameError}</p>
        )}
        <div className="my-3">
          <label className="block text-sm font-medium text-white mb-2">
            Upload File:
          </label>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex-1">
              <input
                type="file"
                id="projectFile"
                accept=".zip,.png,.jpg,.jpeg,.swc,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-full flex items-center justify-between px-3 py-2 border rounded-xl cursor-pointer bg-white/5 hover:bg-white/10">
                <div className="truncate text-sm text-white">{fileLabel}</div>
                <div className="text-sm text-white bg-white/20 px-3 py-1 rounded-lg">
                  Browse
                </div>
              </div>
            </label>

            {/* Show either selected preview or existing file (image) */}
            {filePreview ? (
              <img
                src={filePreview}
                alt="preview"
                className="w-16 h-16 rounded-md object-cover"
              />
            ) : file &&
              file.path_file &&
              (file.path_file.endsWith(".png") ||
                file.path_file.endsWith(".jpg") ||
                file.path_file.endsWith(".jpeg") ||
                file.path_file.endsWith(".webp")) ? (
              <img
                src={`${API_BASE_URL}/${file.path_file}`}
                alt={file.name}
                className="w-16 h-16 rounded-md object-cover"
              />
            ) : (
              <a
                href={
                  file?.path_file ? `${API_BASE_URL}/${file.path_file}` : "#"
                }
                target="_blank"
                rel="noreferrer"
                className="text-sm text-white underline"
              >
                Download current file
              </a>
            )}
          </div>
        </div>

        {/* Tags Section - Styled */}
        <div className="md:px-0 px-0">
          <div className="mt-5 flex items-center">
            <label className="me-4 text-sm font-medium text-white">
              Tag Count:
            </label>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => handleDeleteTag(tags.length - 1)}
                className="bg-white/30 hover:bg-white/50 boder-white border-y border-s text-white font-bold px-3 py-1 rounded-s-xl"
              >
                -
              </button>
              <span className="px-3 py-1 border-white border-y">
                {tags.length}
              </span>
              <button
                type="button"
                onClick={handleAddTag}
                className="bg-white/30 hover:bg-white/50 boder-white border-y border-e text-white font-bold px-3 py-1 rounded-e-xl"
              >
                +
              </button>
            </div>
          </div>

          <div className="overflow-auto h-24 scrollbar-custom mt-1 pe-6">
            {tags.map((tag, index) => (
              <div key={index} className="my-2.5">
                <div className="flex items-center">
                  <input
                    type="text"
                    placeholder="Tag name..."
                    value={tag}
                    onChange={(event) => handleTagChange(index, event)}
                    className={`block w-full rounded-xl bg-transparent px-3 py-1.5 text-base outline outline-1 -outline-offset-1 placeholder:text-white focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 ${
                      tagErrors[tag] ? "border-red-500" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(index)}
                    className="text-red-500 ml-2"
                  >
                    <div className="bg-white/20 hover:bg-red-700 boder-white border p-1.5 rounded-lg">
                      <img
                        src="../../../img/icon/trash.svg"
                        width={28}
                        alt="Trash-Can"
                      />
                    </div>
                  </button>
                </div>
                {tagErrors[tag] && (
                  <p className="text-red-500 text-sm">{tagErrors[tag]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ModalFooter name="Save" onClose={onCloseModalEditFile} />
    </form>
  );
}
