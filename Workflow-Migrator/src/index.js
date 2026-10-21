import Resolver from '@forge/resolver';
import { kvs, WhereConditions} from '@forge/kvs';
import { startSyncHandler, checkSyncStatusHandler, syncFieldsFromDistantSite } from './sync';
import { receiveData } from './receiveData';
import { getActiveConnection } from './utilities';
import { getFields, applyMigrations } from './database';
import { getWorkflows, hasOnresolveElement } from './workflows';
import { getAllConnections, activateConnection, saveConnection, generateMyWebTriggerUrl } from './configuration';

const resolver = new Resolver();

resolver.define('hasOnresolveElement', hasOnresolveElement);
resolver.define('getWorkflows', getWorkflows);
resolver.define('createTables', applyMigrations);
resolver.define('generateMyWebTriggerUrl', generateMyWebTriggerUrl);
resolver.define('saveConnection', saveConnection);
resolver.define('activateConnection', activateConnection);
resolver.define('getAllConnections', getAllConnections);
resolver.define('getActiveConnection', getActiveConnection);
resolver.define('syncFieldsFromDistantSite', syncFieldsFromDistantSite);
resolver.define('getFields', getFields);
resolver.define('startSync', startSyncHandler);
resolver.define('checkSyncStatus', checkSyncStatusHandler);

export const handler = resolver.getDefinitions();

export { processBackgroundSync } from './sync';
export { receiveData } from './receiveData';