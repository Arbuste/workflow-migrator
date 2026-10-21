import api, { route, webTrigger } from '@forge/api';
import kvs from '@forge/kvs';

export async function callDistantSite(url, method, headers = {}, body = null) {

    console.log(url);
    const response = await api.fetch(url, {
        method: method,
        headers: headers,
        body: body
    });

    console.log("retour", response);

    if (!response.ok) {
        console.error("Échec de la synchronisation vers le Site B");
    }
  
    return await response;
}

export async function getActiveConnection() {
    console.log("tentative de récupération de la connexion active depuis KVS");
    try {
        const activeSiteName = await kvs.get('active-connection');
        if (!activeSiteName) {
            return null; // Aucune connexion active
        }
        const activeConnectionUrl = await kvs.get(activeSiteName);
        return activeConnectionUrl;
    } catch (error) {
        console.error("Erreur lors du requêtage KVS :", error);
        return null;
    }
}