import { sql, migrationRunner } from '@forge/sql';

export const CREATE_WORKFLOWS_TABLE = `CREATE TABLE IF NOT EXISTS workflows (
        workflow_id_a VARCHAR(100) PRIMARY KEY,
        workflow_name VARCHAR(255) NOT NULL,
        workflow_id_b VARCHAR(100) NULL,
        workflow_transitions_source LONGTEXT NOT NULL,
        workflow_transitions_target LONGTEXT NULL,
        project_usages LONGTEXT NULL
      )`;

export const CREATE_FIELD_MAPPINGS_TABLE = `CREATE TABLE IF NOT EXISTS field_mappings (
        field_id_a VARCHAR(100) PRIMARY KEY,
        field_name VARCHAR(255) NOT NULL,
        field_type VARCHAR(255) NOT NULL,
        field_id_b VARCHAR(100) NULL,
        origin VARCHAR(20) NOT NULL DEFAULT 'auto',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`;

export const CREATE_MIGRATION_STEPS_LOGS_TABLE = `CREATE TABLE IF NOT EXISTS migration_steps_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        action VARCHAR(255) NOT NULL,
        element VARCHAR(255) NOT NULL,
        detail LONGTEXT NULL
      )`;

const createDBobjects = migrationRunner
  .enqueue('v001_create_fields_mappings_table', CREATE_FIELD_MAPPINGS_TABLE)
  .enqueue('v002_create_migration_steps_logs_table', CREATE_MIGRATION_STEPS_LOGS_TABLE)
  .enqueue('v003_create_workflows_table', CREATE_WORKFLOWS_TABLE)

export const applyMigrations = async () => {
    const successfulMigrations = await createDBobjects.run();
    console.log('Migrations applied:', successfulMigrations);
    await migrationRunner
        .list()
        .then((migration) => migration.map((y) => console.log(`${y.name} migrated at ${y.migratedAt.toUTCString()}`)));
};

export const installDatabaseTables = async () => {
  try {
    await applyMigrations();
  } catch (error) {
    console.error('Erreur lors de l\'application des migrations :', error);
  }
}

export async function getWorkflowsFromDb() {
  try {
    console.log("Récupération des workflows");
    const query = `SELECT * FROM workflows ORDER by workflow_name ASC`;
    const resultQuery = sql.prepare(query);
    console.log(resultQuery);
    const result = await resultQuery.execute();
    return { values: result.rows.map(row => ({
      id: row.workflow_id_a,
      name: row.workflow_name,
      targetId: row.workflow_id_b,
      sourceDescription: row.workflow_transitions_source,
      targetDescription: row.workflow_transitions_target,
      projectUsages: row.project_usages ? JSON.parse(row.project_usages) : []
    })) };
  } catch (error) {
    console.error("Erreur lors de la récupération des workflows", error);
  }
} 

export async function getFields() {
    try {
      console.log("récupération des champs");
        const query = `SELECT * FROM field_mappings ORDER BY field_name ASC`;
        const result = await sql.prepare(query).execute();
        return { values: result.rows.map(row => ({
            name: row.field_name,
            type: row.field_type,
            idSource: row.field_id_a,
            idTarget: row.field_id_b
        })) };
    } catch (error) {
        const CREATE_FIELD_MAPPINGS_TABLE = `CREATE TABLE IF NOT EXISTS field_mappings (
        field_id_a VARCHAR(100) PRIMARY KEY,
        field_name VARCHAR(255) NOT NULL,
        field_type VARCHAR(255) NOT NULL,
        field_id_b VARCHAR(100) NULL,
        origin VARCHAR(20) NOT NULL DEFAULT 'auto',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`;

        const CREATE_MIGRATION_STEPS_LOGS_TABLE = `CREATE TABLE IF NOT EXISTS migration_steps_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action VARCHAR(255) NOT NULL,
                element VARCHAR(255) NOT NULL,
                detail LONGTEXT NULL
            )`;

        const createDBobjects = migrationRunner
        .enqueue('v001_create_fields_mappings_table', CREATE_FIELD_MAPPINGS_TABLE)
        .enqueue('v002_create_migration_steps_logs_table', CREATE_MIGRATION_STEPS_LOGS_TABLE)


        const successfulMigrations = await createDBobjects.run();
        console.log('Migrations applied:', successfulMigrations);
        await migrationRunner
            .list()
            .then((migration) => migration.map((y) => console.log(`${y.name} migrated at ${y.migratedAt.toUTCString()}`)));
        
        console.error("Erreur lors de la récupération des champs :", error);
        throw new Error("Impossible de récupérer les champs.");
    }
}