import { webTrigger } from '@forge/api';
import { kvs, WhereConditions} from '@forge/kvs';

export async function generateMyWebTriggerUrl() {
  try {
    // La clé relie cette URL au webtrigger de réception déclaré dans le manifeste.
    const url = await webTrigger.getUrl('receive-sync-webhook');
    console.log("URL générée avec succès pour ce site");
    return url; 
  } catch (error) {
    console.error("Erreur lors de la génération de l'URL:", error);
    throw new Error("Impossible de générer l'URL du webhook.");
  }
}

export async function saveConnection({ payload }) {
  const { siteName, webTriggerUrl } = payload;
  console.log(siteName);
  if (!siteName || !webTriggerUrl) {
    throw new Error("Merci de fournir un nom de site et une URL de webhook valides.");
  }

  const storageKey = `connection-${siteName}`;

  try {
    await kvs.set(storageKey, webTriggerUrl);
    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la sauvegarde KVS :", error);
    return { success: false };
  }
}

export async function activateConnection ({ payload }) {

    const { siteName } = payload;
    if (!siteName) {
    throw new Error("Merci de fournir un nom de site valide.");
    }

    const storageKey = `connection-${siteName}`;

    try {
        await kvs.set('active-connection', storageKey);
        return { success: true };
    } catch (error) {
        console.error("Erreur lors de la sauvegarde KVS :", error);
        return { success: false };
    }
}

export async function getAllConnections() {
  try {
    // Charge uniquement les connexions enregistrées par l'application.
    const { results } = await kvs.query()
      .where('key', WhereConditions.beginsWith('connection-'))
      .getMany();

    const activeSiteName = await kvs.get('active-connection');

    // N'expose que le nom et l'état actif nécessaires à l'interface.
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