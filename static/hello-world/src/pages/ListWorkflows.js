import React, { useEffect, useState } from "react";
import { invoke } from "@forge/bridge";

function getProjectKey(project) {
  return project.key || project.projectKey || project.projectId || project.id;
}

function getProjectName(project) {
  return project.name || project.projectName || project.key || project.projectKey || project.projectId || project.id;
}

function getProjectSettingsHref(project) {
  const projectKey = getProjectKey(project);
  return `${window.location.origin}/projects/${projectKey}/settings`;
}

function WorkflowRow({ workflow, selected, onToggle }) {
  const projects = workflow.projectUsages || [];

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td>{workflow.name}</td>
      <td>
        {projects.length > 0 ? (
          <ul>
            {projects.map((project) => {
              const projectKey = getProjectKey(project);
              const projectName = getProjectName(project);
              return (
                <li key={projectKey}>
                  <a
                    href={getProjectSettingsHref(project)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {`${projectName} (${projectKey})`}
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          "-"
        )}
      </td>
      <td>
        <button type="button">...</button>
      </td>
    </tr>
  );
}

function ListWorkflows() {
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeConnection, setActiveConnection] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [status, setStatus] = useState(null);
  const pageSize = 20;

  useEffect(() => {
    async function fetchAllWorkflows() {
      setLoading(true);
      try {
        const data = await invoke("getWorkflows", {});
        setAllWorkflows(data.values || []);
        setLoading(false);
      } catch (error) {
        console.error("Erreur lors de la récupération des workflows :", error);
      }
      setLoading(false);
    }
    fetchAllWorkflows();

    async function fetchConnection() {
      try {
          const connection = await invoke('getActiveConnection');
          
          // On applique la sécurité contre l'objet vide {} qu'on a vue ensemble !
          if (connection && Object.keys(connection).length > 0) {
              setActiveConnection(connection);
          } else {
              setActiveConnection(null);
          }
      } catch (error) {
        console.error("Erreur lors de la récupération de la connexion :", error);
      }
    }
    fetchConnection();
  }, []);

  const toggleSelection = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSyncClick = async () => {
    setError(null);
    setSuccess(null);
    
    if (!activeConnection) {
        setError("Erreur : Aucun site cible n'est configuré comme actif.");
        return;
    }

    setStatus('processing');
    setLoading(true);
    try {
        const response = await invoke('startSync', { type: 'workflows' });
        if (response.status === 'started') {
            // 2. On crée un minuteur pour vérifier l'état régulièrement
            const intervalId = setInterval(async () => {
                const currentStatus = await invoke('checkSyncStatus', { type: 'workflows' });
                console.log(currentStatus);
                if (currentStatus.status === 'completed') {
                    clearInterval(intervalId); // On arrête le minuteur
                    setStatus('completed');
                    setSuccess("Synchronisation des workflows réussie !");
                    const workflows = await invoke('getWorkflows');
                    console.log(workflows);
                    setAllWorkflows(workflows.values || []);
                    setLoading(false);
                } else if (currentStatus.status === 'failed') {
                    clearInterval(intervalId);
                    setStatus('failed');
                    setError(currentStatus.error || "Erreur inconnue pendant la synchronisation.");
                    setLoading(false);
                }
            }, 3000); // Vérification toutes les 3 secondes
        } else {
            console.log(response.status)
            setError("Le serveur n'a pas pu démarrer la tâche.");
            setLoading(false);
        }
    } catch (err) {
        setError("Erreur lors de la synchronisation des worfklows.");
        setLoading(false);
    }
};

  async function handleWorkflowGeneration(ids = []) {
    return;
  }

  async function handleWorkflowMigration(ids = []) {
    return;
  }

  const pageStartIndex = page * pageSize;
  const pageEndIndex = pageStartIndex + pageSize;
  const pageWorkflows = allWorkflows.slice(pageStartIndex, pageEndIndex);
  const pageCount = Math.ceil(allWorkflows.length / pageSize);

  return (
    <div>
      <h2>List Workflows</h2>
          <button type="button" onClick={handleSyncClick} disabled={loading}>
              {loading ? "Récupération en cours..." : "Récupérer les workflows"}
          </button>
          {activeConnection &&
            <>
            <button
            type="button"
            onClick={handleWorkflowGeneration}
            disabled={loading}
            style={{ marginLeft: '10px' }}>
              Générer les versions cibles
            </button>
            <button
            type="button"
            onClick={handleWorkflowMigration}
            disabled={loading}
            style={{ marginLeft: '10px' }}>
              Migrer les workflows
            </button>
            </>
          }
          {loading ? (
            <p>Loading workflows...</p>
          ) : (
          <>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Projects</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageWorkflows.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  selected={selectedIds.has(workflow.id)}
                  onToggle={() => toggleSelection(workflow.id)}
                />
              ))}
            </tbody>
          </table>
          <div>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={page === 0}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {pageCount || 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, pageCount - 1))}
              disabled={page >= pageCount - 1}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ListWorkflows;
