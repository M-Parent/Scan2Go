import React, { useState } from "react";
import { ModalInputText } from "./ModalInputText";
import { ModalInputFile } from "./ModalInputFile";
import { ModalTitle } from "./ModalTitle";
import { ModalFooter } from "./ModalFooter";
import API_BASE_URL from "../../../api";

export function ModalAddProject({ onCloseModal, onProjectAdded }) {
  // Added the onProjectAdded prop
  const [projectName, setProjectName] = useState("");
  const [projectImage, setProjectImage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!projectName) {
      setError("Project name is required.");
      return;
    }

    const formData = new FormData();
    formData.append("projectName", projectName);
    formData.append("projectImage", projectImage);

    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        console.log("Project added successfully!");

        const newProject = await response.json(); // Get the new project from the response

        if (onProjectAdded) {
          onProjectAdded(newProject); // Call the callback function
        }

        if (onCloseModal) onCloseModal();

        setProjectName("");
        setProjectImage(null);
      } else {
        // Read the body once and try to parse JSON, otherwise display raw text
        try {
          const text = await response.text();
          try {
            const errorData = JSON.parse(text);
            setError(errorData.error || "Error adding project.");
            console.error("Error adding project:", errorData);
          } catch (parseError) {
            setError("Error adding project (server error)");
            console.error("Error adding project (non-JSON):", text);
          }
        } catch (readError) {
          setError("Error adding project (reading response)");
          console.error("Unable to read server response:", readError);
        }
      }
    } catch (error) {
      setError("Erreur de connexion.");
      console.error("Erreur de connexion:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <ModalTitle title="ADD PROJECT" onClose={onCloseModal} />
      <div className="pt-7 md:px-14 px-7">
        <ModalInputText
          label="Project Name:"
          for="projectName"
          placeholder="Server, Network..."
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
        <ModalInputFile
          label="Project Image:"
          for="projectImage"
          onChange={(file) => setProjectImage(file)}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>
      <ModalFooter name="ADD" onClick={handleSubmit} onClose={onCloseModal} />
    </form>
  );
}
