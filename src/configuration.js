import { webTrigger } from '@forge/api';
import { kvs, WhereConditions} from '@forge/kvs';

// Fonction appelée par votre UI (Custom UI ou UI Kit) sur la page admin
export async function generateMyWebTriggerUrl() {
  try {
    // 'receive-sync-webhook' doit correspondre exactement à la 'key' dans votre manifest.yml
    const url = await webTrigger.getUrl('receive-sync-webhook');
    console.log("URL générée avec succès pour ce site");
    return url; 
  } catch (error) {
    console.error("Erreur lors de la génération de l'URL:", error);
    throw new Error("Impossible de générer l'URL du webhook.");
  }
}

// Fonction appelée quand l'admin du Site A valide le formulaire de connexion
export async function saveConnection({ payload }) {
  const { siteName, webTriggerUrl } = payload;
  console.log(siteName);
  if (!siteName || !webTriggerUrl) {
    throw new Error("Merci de fournir un nom de site et une URL de webhook valides.");
  }

  const storageKey = `connection-${siteName}`;

  try {
    // 2. Utilisation de kvs.set() à la place de storage.setSecret()
    await kvs.set(storageKey, webTriggerUrl);
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la sauvegarde KVS :", error);
    return { success: false };
  }
}

// Fonction appelée quand l'admin du Site A valide le formulaire de connexion
export async function activateConnection ({ payload }) {

    const { siteName } = payload;
    if (!siteName) {
    throw new Error("Merci de fournir un nom de site valide.");
    }

    const storageKey = `connection-${siteName}`;

    try {
        // 2. Utilisation de kvs.set() à la place de storage.setSecret()
        await kvs.set('active-connection', storageKey);
        return { success: true };
    } catch (error) {
        console.error("Erreur lors de la sauvegarde KVS :", error);
        return { success: false };
    }
}

export async function getAllConnections() {
  try {
    // On demande à KVS toutes les clés qui commencent par "connection:"
    const { results } = await kvs.query()
      .where('key', WhereConditions.beginsWith('connection-'))
      .getMany();

    const activeSiteName = await kvs.get('active-connection');

    // 'results' est un tableau d'objets contenant { key, value }
    // On le transforme pour l'adapter au format attendu par le front
    return results.map(item => {
        const result = { siteName: item.key.replace('connection-', '') };
        if (item.key === activeSiteName) {
            result.isActive = true;
        }
        return result;
    });
  } catch (error) {
    console.error("Erreur lors du requêtage KVS :", error);
    return [];
  }
}