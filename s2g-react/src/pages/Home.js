import { AddGlass } from "../component/molecules/glass/AddGlass";
import { LogoGlass } from "../component/molecules/glass/LogoGlass";
import { ProjectGlass } from "../component/molecules/glass/ProjectGlass";
import { useState, useEffect, useCallback } from "react"; // Import useCallback
import { Modal } from "../component/molecules/modal/Modal";
import { ModalAddProject } from "../component/molecules/modal/ModalAddProject";
import { ModalEditProject } from "../component/molecules/modal/ModalEditProject";
import { CardProject } from "../component/molecules/CardProject";
import API_BASE_URL from "../api";
import { Link } from "react-router-dom";

export function Home() {
  const [projects, setProjects] = useState([]);
  const [showModalAddProject, setShowModalAddProject] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState(null);
  const [showModalEditProject, setShowModalEditProject] = useState(false);

  const fetchProjects = useCallback(async () => {
    // useCallback for memoization
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      } else {
        console.error("Error fetching projects:", response.status);
        // Consider displaying a user-friendly error message here
      }
    } catch (error) {
      console.error("Connection error:", error);
      // Consider displaying a user-friendly error message here
    }
  }, []); // Empty dependency array as it doesn't depend on any props or state

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]); // Call fetchProjects using the memoized version

  const handleProjectAdded = (newProject) => {
    setProjects((prevProjects) => [...prevProjects, newProject]); // Functional update
    setShowModalAddProject(false);
  };

  const handleEditClick = (project) => {
    setProjectToEdit(project);
    setShowModalEditProject(true);
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
        const updatedProjectFromServer = await response.json();
        setProjects(
          (
            prevProjects // Functional update
          ) =>
            prevProjects.map((project) =>
              project.id === updatedProject.id
                ? updatedProjectFromServer
                : project
            )
        );
        setShowModalEditProject(false);
        setProjectToEdit(null);
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

  const handleDeleteProject = async (projectId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setProjects(
          (
            prevProjects // Functional update
          ) => prevProjects.filter((project) => project.id !== projectId)
        );
        console.log("Project deleted successfully");
      } else {
        console.error("Error deleting project:", response.status);
        const errorData = await response.json();
        alert(errorData.error || "Failed to delete project");
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert("A network error occurred while deleting the project.");
    }
  };

  return (
    <>
      <LogoGlass alt="Logo of Scan2Go" />

      {projects.length > 0 ? ( // Simplified conditional rendering
        <ProjectGlass projects={projects}>
          <div className="lg:flex lg:justify-around justify-center py-6 overflow-x-hidden overflow-y-auto h-full scrollbar-custom">
            <div className="grid justify-center items-center xl:grid-cols-3 md:gap-12 gap-8">
              <button
                className="rounded-3xl"
                onClick={() => setShowModalAddProject(true)}
              >
                <AddGlass />
              </button>
              {projects.map((project) => (
                <Link to={`/Project/${project.id}`} key={project.id}>
                  <CardProject
                    key={project.id}
                    projectName={project.project_name}
                    projectImage={`/${project.project_image}`}
                    onEditClick={() => handleEditClick(project)} // Pass the project
                    onDelete={() => handleDeleteProject(project.id)}
                    projectId={project.id}
                  />
                </Link>
              ))}
            </div>
          </div>
        </ProjectGlass>
      ) : (
        <div className="flex justify-center mt-32">
          <button
            className="transition hover:translate-y-1 hover:duration-700 hover:ease-in-out"
            onClick={() => setShowModalAddProject(true)}
          >
            <AddGlass />
          </button>
        </div>
      )}

      <Modal isVisible={showModalAddProject}>
        <ModalAddProject
          onCloseModal={() => setShowModalAddProject(false)}
          onProjectAdded={handleProjectAdded}
        />
      </Modal>
      <Modal isVisible={showModalEditProject}>
        {projectToEdit && (
          <ModalEditProject
            onCloseModalEditProject={() => {
              setShowModalEditProject(false);
              setProjectToEdit(null);
            }}
            project={projectToEdit}
            onProjectUpdated={handleProjectUpdated}
          />
        )}
      </Modal>
    </>
  );
}
