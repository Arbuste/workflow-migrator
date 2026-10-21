import { getWorkflowsFromDb } from './database';
import api, { route, webTrigger } from '@forge/api';

export async function hasOnresolveElement(workflow) {
    const transitions = workflow.transitions || [];

    for (const transition of transitions) {
        const actions = transition.actions || [];
        const validators = transition.validators || [];
        
        for (const action of actions) {
            const appKey = action.parameters?.appKey || '';
            if (appKey.includes('com.onresolve')) {
                return true;
            }
        }
        
        for (const validator of validators) {
            console.log(JSON.stringify(validator));
            const appKey = validator.parameters?.appKey || '';
            if (appKey.includes('com.onresolve')) {
                return true;
            }
        }
    }
    
    return false;
}

export async function getWorkflows() {
    try {
      return getWorkflowsFromDb();
    } catch (error) {
        console.error("Erreur lors de la récupération des workflows", error);
    }
}