import React, { useEffect, useState } from "react";
import { invoke } from '@forge/bridge';

function FieldRow({ field }) {
    return (
        <tr>
            <td>{field.name}</td>
            <td>{field.type}</td>
            <td>{field.idSource}</td>
            <td>{field.idTarget}</td>
        </tr>
    );
}

function ListFields() {

    const [allFields, setAllFields] = useState([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [activeConnection, setActiveConnection] = useState(null);
    const pageSize = 20;

    useEffect(() => {
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
            } finally {
                setLoading(false); // Le chargement est terminé, quoi qu'il arrive
            }
        }

        fetchConnection();
    }, []);

    // On récupère directement la connexion active depuis le contexte de l'application
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
            const response = await invoke('startSync', { type: 'fields' });
            if (response.status === 'started') {
                // 2. On crée un minuteur pour vérifier l'état régulièrement
                const intervalId = setInterval(async () => {
                    const currentStatus = await invoke('checkSyncStatus', { type: 'fields' });
                    console.log(currentStatus);
                    if (currentStatus.status === 'completed') {
                        clearInterval(intervalId); // On arrête le minuteur
                        setStatus('completed');
                        setSuccess("Synchronisation des champs réussie !");
                        const fields = await invoke('getFields');
                        console.log(fields);
                        setAllFields(fields.values || []);
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
            setError("Erreur lors de la synchronisation des champs.");
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (!allFields || allFields.length === 0) {
            alert("Aucun champ à exporter !");
            return;
        }

        // A. Création de l'en-tête du fichier CSV
        let csvContent = "Nom du champ,Type du champ,ID Source,ID Target\n";

        // B. Boucle sur les données pour créer les lignes
        allFields.forEach(field => {
            // On met le nom entre guillemets pour éviter que d'éventuelles virgules 
            // dans le nom du champ ne cassent les colonnes du CSV.
            const safeName = field.name ? `"${field.name.replace(/"/g, '""')}"` : "";
            const type = field.type || "";
            const idSource = field.idSource || "";
            const idTarget = field.idTarget || "";
            
            csvContent += `${safeName},${type},${idSource},${idTarget}\n`;
        });

        // C. La magie du navigateur : créer un fichier virtuel et le télécharger
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'mapping_champs.csv'); // Nom du fichier
        document.body.appendChild(link);
        
        link.click(); // Simule le clic de l'utilisateur
        
        // D. Nettoyage
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        async function fetchAllFields() {
            setLoading(true);
            const data = await invoke("getFields");
            setAllFields(data.values || []);
            setLoading(false);
        }

        fetchAllFields();
    }, []);

  const pageStartIndex = page * pageSize;
  const pageEndIndex = pageStartIndex + pageSize;
  const pageFields = allFields.slice(pageStartIndex, pageEndIndex);
  const pageCount = Math.ceil(allFields.length / pageSize);

  return (
    <div>
      <h2>Liste des champs</h2>
      {error && 
        <p>{error}</p>
      }
      {success && 
        <p>{success}</p>
      }
      {activeConnection ? (
        <>
            <button type="button" onClick={handleSyncClick} disabled={loading}>
                {loading ? "Génération en cours..." : "Générer les correspondances"}
            </button>
            {allFields &&
            <button 
                type="button" 
                onClick={handleExportCSV} 
                disabled={allFields.length === 0}
                style={{ marginLeft: '10px' }} // Petit espacement si besoin
            >
                📥 Exporter en CSV
            </button>
            }
            {loading ? (
                <p>Loading fields...</p>
            ) : (
                <>
                <table>
                    <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>ID Source</th>
                        <th>ID Target</th>
                    </tr>
                    </thead>
                    <tbody>
                    {pageFields.map((field) => (
                        <FieldRow
                        key={field.idSource}
                        field={field}
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
        </>
      ) : (
        <p>Aucun site cible n'est configuré comme actif. Veuillez configurer un site cible dans la page de configuration.</p>
    )}
    </div>
  );
}

export default ListFields;