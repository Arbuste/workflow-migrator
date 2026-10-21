import React, { useEffect, useState } from "react";
import { invoke } from "@forge/bridge";

// Configuration page for the Workflow Migrator app
function Configuration() {
  const [webTriggerUrl, setWebTriggerUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [connections, setConnections] = useState([]);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");

  useEffect(() => {
    async function loadConnections() {
      try {
        const result = await invoke("getAllConnections");
        setConnections(result || []);
      } catch (err) {
        setError(err.message || "Impossible de charger les connexions.");
      }
    }

    loadConnections();
  }, []);

  const handleGenerateUrl = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const url = await invoke("generateMyWebTriggerUrl");
      setWebTriggerUrl(url);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddConnectionClick = () => {
    setError(null);
    setSuccess(null);
    setSiteName("");
    setSiteUrl("");
    setIsEditing(false);
    setShowConnectionForm(true);
  };

  const handleEditConnectionClick = (connection) => {
    setError(null);
    setSuccess(null);
    setSiteName(connection.siteName || "");
    setSiteUrl("");
    setIsEditing(true);
    setShowConnectionForm(true);
  };

  const handleActivateConnectionClick = async(connection) => {
    setError(null);
    setSuccess(null);
    setSiteName(connection.siteName || "");
    try {
        await invoke("activateConnection", {
            siteName: siteName.trim()
        });
        const result = await invoke("getAllConnections");
        setSuccess("Connexion activée avec succès !");
        setConnections(result || []);
    } catch (err) {
      setError(err.message || "Impossible d'activer la connexion.");
    }
  };

  const handleCancelEdit = () => {
    setShowConnectionForm(false);
    setIsEditing(false);
    setSiteName("");
    setSiteUrl("");
  };

  const handleCreateTables = async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      await invoke('createTables');
      setSuccess("Tables générées");
    } catch (error) {
      setError("Erreur en générant les tables", error);
    }
    setIsLoading(false);
  };

  const handleSaveConnection = async () => {
    setError(null);
    setSuccess(null);

    if (!siteName.trim() || !siteUrl.trim()) {
      setError("Veuillez renseigner le nom du site et l'URL.");
      return;
    }

    try {
      await invoke("saveConnection", {
        siteName: siteName.trim(),
        webTriggerUrl: siteUrl.trim(),
      });
      setShowConnectionForm(false);
      setSuccess("Connexion sauvegardée avec succès !");

      const result = await invoke("getAllConnections");
      setConnections(result || []);
    } catch (err) {
      setError(err.message || "Impossible de sauvegarder la connexion.");
    }
  };

  return (
    <div>
      <h2>Configuration</h2>
      <p>This is the configuration page for the Workflow Migrator app.</p>
      <button type="button" onClick={handleGenerateUrl} disabled={isLoading}>
        {isLoading ? "Génération en cours..." : "Générer URL"}
      </button>

      <button type="button" onClick={handleCreateTables} disabled={isLoading} style={{ marginLeft: '10px' }}>
        {isLoading ? "Création des tables en cours..." : "Créer les tables"}
      </button>

      {webTriggerUrl && (
        <div style={{ marginTop: "1rem" }}>
          <strong>URL générée :</strong>
          <div>
            <a href={webTriggerUrl} target="_blank" rel="noopener noreferrer">
              {webTriggerUrl}
            </a>
          </div>
        </div>
      )}

      {connections.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Connexions actives</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Nom de la connexion
                </th>
                <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection) => (
                <tr key={connection.siteName}>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    {connection.siteName}
                  </td>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    <button type="button" onClick={() => handleEditConnectionClick(connection)}>
                      Edit
                    </button>
                    {!connection.isActive && (
                        <button type="button" onClick={() => handleActivateConnectionClick(connection)}>
                        Activer
                        </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <button type="button" onClick={handleAddConnectionClick}>
          Ajouter une connexion
        </button>
      </div>

      {showConnectionForm && (
        <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ccc", borderRadius: "4px" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>
              Nom du site
              <br />
              <input
                type="text"
                value={siteName}
                readOnly={isEditing}
                onChange={(event) => {
                  if (!isEditing) {
                    setSiteName(event.target.value);
                  }
                }}
                style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
              />
            </label>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>
              URL
              <br />
              <input
                type="text"
                value={siteUrl}
                onChange={(event) => {
                  setSiteUrl(event.target.value);
                }}
                style={{ width: "100%", padding: "0.5rem", boxSizing: "border-box" }}
              />
            </label>
          </div>
          <div>
            <button type="button" onClick={handleSaveConnection} style={{ marginRight: "0.75rem" }}>
              Valider
            </button>
            <button type="button" onClick={handleCancelEdit}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {success && (
        <div style={{ marginTop: "1rem", color: "green" }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ marginTop: "1rem", color: "red" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default Configuration;
