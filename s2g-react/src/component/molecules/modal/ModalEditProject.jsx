import { ModalInputText } from "./ModalInputText";
import { ModalInputFile } from "./ModalInputFile";
import { ModalTitle } from "./ModalTitle";
import { ModalFooter } from "./ModalFooter";
import React, { useState, useEffect, useRef } from "react";
import API_BASE_URL from "../../../api";

export function ModalEditProject({
  onCloseModalEditProject,
  project, // Can be null if data needs to be loaded
  projectId, // Project ID if data needs to be loaded
  onProjectUpdated,
}) {
  const [editedProject, setEditedProject] = useState(null);
  const [projectImage, setProjectImage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false); // Added loading state
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchProjectData = async () => {
      setLoading(true);
      try {
        let projectData;
        if (project) {
          projectData = project;
        } else if (projectId) {
          const response = await fetch(
            `${API_BASE_URL}/api/projects/${projectId}`
          );
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to fetch project");
          }
          projectData = await response.json();
        } else {
          throw new Error("Missing project data or ID");
        }
        setEditedProject({ ...projectData });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [project, projectId]);

  const handleImageChange = (file) => {
    setProjectImage(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission

    if (!editedProject || !editedProject.project_name) {
      setError("Project name is required.");
      return;
    }

    const formData = new FormData();
    formData.append("projectName", editedProject.project_name);
    if (projectImage) {
      formData.append("projectImage", projectImage);
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${editedProject.id}`, // Make sure editedProject.id is correct
        {
          method: "PUT",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update project");
      }

      const updatedProject = await response.json();
      onProjectUpdated(updatedProject);
      onCloseModalEditProject(); // Close the modal on success

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setProjectImage(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); // Set loading back to false after submission (success or error)
    }
  };

  if (loading || !editedProject) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <ModalTitle title="EDIT PROJECT" onClose={onCloseModalEditProject} />
      <div className="pt-7 md:px-14 px-7">
        <ModalInputText
          label="Project Name:"
          for="projectName"
          placeholder="Server, Network..."
          value={editedProject.project_name}
          onChange={(e) =>
            setEditedProject({ ...editedProject, project_name: e.target.value })
          }
        />
        <ModalInputFile
          label="Project Image:"
          for="projectImage"
          onChange={handleImageChange}
          ref={fileInputRef}
          initialUrl={
            editedProject.project_image
              ? `${API_BASE_URL}/${editedProject.project_image}`
              : null
          }
        />
      </div>
      {error && <div className="error-message">{error}</div>}
      <ModalFooter name="Save" onClose={onCloseModalEditProject} />
    </form>
  );
}
