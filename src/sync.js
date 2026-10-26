import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { sql } from '@forge/sql';
import { callDistantSite, getActiveConnection } from './utilities';
import { hasOnresolveElement } from './workflows';
import api, { route, webTrigger } from '@forge/api';

const syncQueue = new Queue({ key: 'my-sync-queue' });

export async function syncWorkflows() {

    const url = await getActiveConnection();
    if (!url) {
        throw new Error("Pas de connexion active définie.");
    }
    
    try {
        let allFilteredWorkflows = [];
        let apiPage = 0;
        let hasMoreOnApi = true;
        const pageSize = 20;

        // Fetch ALL workflows from the API
        while (hasMoreOnApi) {
            const startAt = apiPage * pageSize;
            console.log(`Fetching API page ${apiPage}, startAt=${startAt}`);
            
            const response = await api.asApp().requestJira(
                route`/rest/api/3/workflows/search?expand=values.transitions&startAt=${startAt}&maxResults=${pageSize}`
            );
            const data = await response.json();
            const workflows = data.values || [];

            if (workflows.length === 0) {
                hasMoreOnApi = false;
                break;
            }

            const filtered = workflows.filter((workflow) => hasOnresolveElement(workflow));
            allFilteredWorkflows = allFilteredWorkflows.concat(filtered);
            
            console.log(`Got ${workflows.length} workflows, ${filtered.length} filtered. Total filtered so far: ${allFilteredWorkflows.length}`);
            
            apiPage++;
        }

        console.log(`Total filtered workflows: ${allFilteredWorkflows.length}`);

        // Enrich all with project usages
        const workflowsWithUsage = await Promise.all(
            allFilteredWorkflows.map(async (workflow) => {
                const projectUsageResponse = await api.asApp().requestJira(
                    route`/rest/api/3/workflow/${workflow.id}/projectUsages`
                );
                const projectUsageData = await projectUsageResponse.json();
                const projectIds = (projectUsageData.projects.values || []).map((usage) => usage.id).filter(Boolean);

                console.log(projectIds);

                if (projectIds.length === 0) {
                    return {
                        ...workflow,
                        projectUsages: [],
                    };
                }

                const projectSearchParams = new URLSearchParams();
                projectIds.forEach((id) => projectSearchParams.append('id', id));
                console.log("Workflow Name", workflow.name, "Project IDs", projectIds);
                const projectSearchResponse = await api.asApp().requestJira(
                    route`/rest/api/3/project/search?${projectSearchParams}`
                );
                const projectSearchData = await projectSearchResponse.json();
                const projects = projectSearchData.values || projectSearchData || [];

                return {
                    ...workflow,
                    projectUsages: projects,
                };
            })
        );

        for (const workflow of workflowsWithUsage) {
            const query = `
                INSERT INTO workflows (workflow_id_a, workflow_name, workflow_id_b, workflow_transitions_source, workflow_transitions_target, project_usages)
                VALUES (?, ?, '', ?, '', ?)
                ON DUPLICATE KEY UPDATE 
                    workflow_name = VALUES(workflow_name),
                    workflow_transitions_source = VALUES(workflow_transitions_source),
                    project_usages = VALUES(project_usages);
                `;

            await sql
            .prepare(query)
            .bindParams(workflow.id, workflow.name, JSON.stringify(workflow.transitions), JSON.stringify(workflow.projectUsages) || null)
            .execute();
        }

    } catch (error) {
        console.error("Erreur lors de la récupération des workflows :", error);
        throw new Error("Impossible de récupérer les workflows.");
    }
}

export async function syncFieldsFromDistantSite() {

    const url = await getActiveConnection();
    if (!url) {
        throw new Error("Pas de connexion active définie.");
    }
    
    try {
        const responseLocal = await api.asApp().requestJira(
            route`/rest/api/3/field`
        )
        console.log(responseLocal);
        const dataLocal = await responseLocal.json();

        const responseDistant = await callDistantSite(`${url}?resourceType=field`, 'GET');
        const dataDistant = await responseDistant.json();

        for (const localField of dataLocal) {
            if (localField.id.startsWith('customfield_')) {
                const matchingDistantField = dataDistant.find(distantField => distantField.name === localField.name && distantField.schema?.type === localField.schema?.type && (distantField.schema?.custom === localField.schema?.custom || distantField.schema?.system === localField.schema?.system));
                const query = `
                    INSERT INTO field_mappings (field_id_a, field_name, field_type, field_id_b, origin)
                    VALUES (?, ?, ?, ?, 'auto')
                    ON DUPLICATE KEY UPDATE 
                        field_id_b = IF(origin = 'manual', field_id_b, VALUES(field_id_b)),
                        field_name = VALUES(field_name),
                        field_type = VALUES(field_type);
                    `;

                if (!localField.schema || !localField.schema?.type) {
                    console.log(localField);
                }

                const type = localField.schema?.items
                    ? `${localField.schema?.type} - ${localField.schema?.items}`
                    : `${localField.schema?.type}`;
                
                console.log(localField.name,type);

                await sql
                .prepare(query)
                .bindParams(localField.id, localField.name, type, matchingDistantField?.id || null)
                .execute();

            }
        }

    } catch (error) {
        console.error("Erreur lors de la récupération des champs :", error);
        throw new Error("Impossible de récupérer les champs depuis le site distant.");
    }
}

// 1. Le déclencheur rapide appelé par le Front-end
export async function startSyncHandler({ payload }) {
    const { type } = payload;
    console.log("start sync", type);
    await kvs.set(`sync_status_${type}`, 'processing');
    await syncQueue.push({ body: { type: type, action: 'START_MAPPING' }});
    return { status: 'started' };
}

// 2. Le point de contrôle que le Front-end va interroger régulièrement
export async function checkSyncStatusHandler({ payload }) {
    console.log(payload);
    const { type } = payload;
    console.log("check sync", type);
    const status = await kvs.get(`sync_status_${type}`);
    return { status: status || 'idle' };
}

// 3. LE TRAVAILLEUR DE L'OMBRE (Le Consumer)
export async function processBackgroundSync(event) {
    const type = event.body?.type;
    try {
        if (type === 'fields') {
            await syncFieldsFromDistantSite();
        } else if (type === 'workflows') {
            await syncWorkflows();
        }
        // À la toute fin, quand tout est réussi :
        await kvs.set(`sync_status_${type}`, 'completed');
    } catch (error) {
        console.error("Échec de la synchro en arrière-plan", error);
        await kvs.set(`sync_status_${type}`, 'failed');
    }
}