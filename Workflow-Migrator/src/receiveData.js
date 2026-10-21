import api, { route, webTrigger } from '@forge/api';


export async function searchFields() {
    try {
        console.log('je vais chercer les champs sur site b');
        const responseFields = await api.asApp().requestJira(route`/rest/api/3/field`);
        console.log('j\'ai fini de chercher les champs');
        return await responseFields.json();
    } catch (error) {
        console.log(error.message);
    }
}

export async function receiveData(request) {
  try {
    // 1. Récupération des composants de la requête HTTP
    const { method, headers, queryParameters, body } = request;
    console.log(request);
    // 2. Exemple de lecture des Query Parameters (?resource=workflow&id=123)
    if (!('resourceType' in queryParameters)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Aucune ressource ciblée." }) };
    }
    const resourceType = queryParameters['resourceType'][0];
    const resourceIds = ('id' in queryParameters ? queryParameters['id'] : null);

    if (resourceType === 'workflow') {
        if (method === 'GET') {
            //return searchWorkflows(resourceIds);
        } else if (method === 'POST') {
            const data = body ? JSON.parse(body) : {};
            if (!data && !resourceId) {
                return { statusCode: 400, body: JSON.stringify({ error: "Aucune donnée reçue." }) };
            } else {

            }
        }
    } else if (resourceType === 'field') {
        if (method === 'GET') {
            const fields = await searchFields();
            return { statusCode: 200, body: JSON.stringify(fields) };
        }
    }

    if (method === 'POST' && resourceType === 'workflow') {
      // Logique pour CREER/MIGRER un workflow avec l'id 'resourceId'
      console.log(`Migration du workflow ${resourceId} initiée.`);
    }

  } catch (error) {
    console.error("Erreur lors de la réception des données :", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}