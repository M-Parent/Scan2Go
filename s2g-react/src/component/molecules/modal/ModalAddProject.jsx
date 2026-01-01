import React, { useState } from "react";
import { ModalInputText } from "./ModalInputText";
import { ModalInputFile } from "./ModalInputFile";
import { ModalTitle } from "./ModalTitle";
import { ModalFooter } from "./ModalFooter";
import API_BASE_URL from "../../../api";

export function ModalAddProject({ onCloseModal, onProjectAdded }) {
  // Ajout de la prop onProjectAdded
  const [projectName, setProjectName] = useState("");
  const [projectImage, setProjectImage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!projectName) {
      setError("Le nom du projet est requis.");
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
        console.log("Projet ajouté avec succès !");

        const newProject = await response.json(); // Récupérer le nouveau projet depuis la réponse

        if (onProjectAdded) {
          onProjectAdded(newProject); // Appeler la fonction de callback
        }

        if (onCloseModal) onCloseModal();

        setProjectName("");
        setProjectImage(null);
      } else {
        // Lire le corps une seule fois et tenter d'analyser JSON, sinon afficher le texte brut
        try {
          const text = await response.text();
          try {
            const errorData = JSON.parse(text);
            setError(errorData.error || "Erreur lors de l'ajout du projet.");
            console.error("Erreur lors de l'ajout du projet:", errorData);
          } catch (parseError) {
            setError("Erreur lors de l'ajout du projet (erreur serveur)");
            console.error("Erreur lors de l'ajout du projet (non-JSON):", text);
          }
        } catch (readError) {
          setError("Erreur lors de l'ajout du projet (lecture réponse)");
          console.error("Impossible de lire la réponse du serveur:", readError);
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
