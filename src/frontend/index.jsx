import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForgeReconciler, {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Link,
  LoadingButton,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
  useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { buildFieldsCsv, getPageFromContext, getProjectKey, getProjectName } from './utils';

const PAGE_SIZE = 20;
const SYNC_POLL_DELAY_MS = 3000;

function Feedback({ error, success }) {
  if (error) {
    return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  }
  if (success) {
    return <SectionMessage appearance="success"><Text>{success}</Text></SectionMessage>;
  }
  return null;
}

function ConfigurationPage() {
  const [connections, setConnections] = useState([]);
  const [webTriggerUrl, setWebTriggerUrl] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadConnections = async () => {
    const result = await invoke('getAllConnections');
    setConnections(result || []);
  };

  useEffect(() => {
    loadConnections().catch((caughtError) => {
      setError(caughtError.message || 'Impossible de charger les connexions.');
    });
  }, []);

  const runAction = async (action, successMessage) => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      await action();
      if (successMessage) setSuccess(successMessage);
    } catch (caughtError) {
      setError(caughtError.message || 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateForm = () => {
    setSiteName('');
    setSiteUrl('');
    setIsEditing(false);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const openEditForm = (connection) => {
    setSiteName(connection.siteName || '');
    setSiteUrl('');
    setIsEditing(true);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setIsEditing(false);
    setSiteName('');
    setSiteUrl('');
  };

  const saveConnection = async () => {
    if (!siteName.trim() || !siteUrl.trim()) {
      setError("Veuillez renseigner le nom du site et l'URL.");
      return;
    }

    await runAction(async () => {
      await invoke('saveConnection', {
        siteName: siteName.trim(),
        webTriggerUrl: siteUrl.trim(),
      });
      await loadConnections();
      closeForm();
    }, 'Connexion sauvegardée avec succès !');
  };

  const connectionRows = connections.map((connection) => ({
    key: connection.siteName,
    cells: [
      { key: 'name', content: <Text>{connection.siteName}</Text> },
      {
        key: 'status',
        content: connection.isActive
          ? <Lozenge appearance="success">Active</Lozenge>
          : <Lozenge>Inactive</Lozenge>,
      },
      {
        key: 'actions',
        content: (
          <ButtonGroup label={`Actions pour ${connection.siteName}`}>
            <Button onClick={() => openEditForm(connection)}>Modifier</Button>
            {!connection.isActive && (
              <Button
                onClick={() => runAction(async () => {
                  await invoke('activateConnection', { siteName: connection.siteName });
                  await loadConnections();
                }, 'Connexion activée avec succès !')}
              >
                Activer
              </Button>
            )}
          </ButtonGroup>
        ),
      },
    ],
  }));

  return (
    <Stack space="space.300">
      <Heading as="h1">Configuration</Heading>
      <Text>Configurez la communication avec le site Jira cible.</Text>
      <Inline space="space.100" shouldWrap>
        <LoadingButton
          appearance="primary"
          isLoading={isLoading}
          onClick={() => runAction(async () => {
            const url = await invoke('generateMyWebTriggerUrl');
            setWebTriggerUrl(url || '');
          })}
        >
          Générer l’URL du webhook
        </LoadingButton>
        <LoadingButton
          isLoading={isLoading}
          onClick={() => runAction(() => invoke('createTables'), 'Tables générées.')}
        >
          Créer les tables
        </LoadingButton>
      </Inline>

      {webTriggerUrl && (
        <Box>
          <Label labelFor="generated-webhook-url">URL générée</Label>
          <Textfield id="generated-webhook-url" value={webTriggerUrl} isReadOnly />
          <Text>Utilisez le champ ci-dessus pour sélectionner et copier l’URL.</Text>
        </Box>
      )}

      <Feedback error={error} success={success} />

      <Stack space="space.150">
        <Inline alignBlock="center" spread="space-between">
          <Heading as="h2">Connexions</Heading>
          <Button appearance="primary" onClick={openCreateForm}>Ajouter une connexion</Button>
        </Inline>
        <DynamicTable
          caption="Connexions enregistrées"
          head={{ cells: [
            { key: 'name', content: 'Nom de la connexion', isSortable: true },
            { key: 'status', content: 'État' },
            { key: 'actions', content: 'Actions' },
          ] }}
          rows={connectionRows}
          rowsPerPage={PAGE_SIZE}
          emptyView={<Text>Aucune connexion enregistrée.</Text>}
        />
      </Stack>

      <ModalTransition>
        {showForm && (
          <Modal onClose={closeForm}>
            <ModalHeader><ModalTitle>{isEditing ? 'Modifier la connexion' : 'Ajouter une connexion'}</ModalTitle></ModalHeader>
            <ModalBody>
              <Stack space="space.200">
                <Box>
                  <Label labelFor="site-name">Nom du site</Label>
                  <Textfield
                    id="site-name"
                    value={siteName}
                    isReadOnly={isEditing}
                    onChange={(event) => setSiteName(event.target.value)}
                  />
                </Box>
                <Box>
                  <Label labelFor="site-url">URL du webhook distant</Label>
                  <Textfield
                    id="site-url"
                    value={siteUrl}
                    onChange={(event) => setSiteUrl(event.target.value)}
                  />
                </Box>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={closeForm}>Annuler</Button>
              <LoadingButton appearance="primary" isLoading={isLoading} onClick={saveConnection}>Enregistrer</LoadingButton>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
}

function useSync(type, reload) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const poll = async () => {
    try {
      const currentStatus = await invoke('checkSyncStatus', { type });
      if (currentStatus.status === 'completed') {
        await reload();
        setSuccess(type === 'fields'
          ? 'Synchronisation des champs réussie !'
          : 'Synchronisation des workflows réussie !');
        setIsSyncing(false);
      } else if (currentStatus.status === 'failed') {
        setError(currentStatus.error || 'Erreur inconnue pendant la synchronisation.');
        setIsSyncing(false);
      } else {
        timeoutRef.current = setTimeout(poll, SYNC_POLL_DELAY_MS);
      }
    } catch (caughtError) {
      setError(caughtError.message || 'Impossible de vérifier la synchronisation.');
      setIsSyncing(false);
    }
  };

  const start = async () => {
    setError(null);
    setSuccess(null);
    setIsSyncing(true);
    try {
      const response = await invoke('startSync', { type });
      if (response.status !== 'started') throw new Error("Le serveur n'a pas pu démarrer la tâche.");
      timeoutRef.current = setTimeout(poll, SYNC_POLL_DELAY_MS);
    } catch (caughtError) {
      setError(caughtError.message || 'Impossible de démarrer la synchronisation.');
      setIsSyncing(false);
    }
  };

  return { isSyncing, error, success, start };
}

function FieldsPage() {
  const [fields, setFields] = useState([]);
  const [activeConnection, setActiveConnection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCsv, setShowCsv] = useState(false);

  const loadFields = async () => {
    const result = await invoke('getFields');
    setFields(result?.values || []);
  };

  const sync = useSync('fields', loadFields);

  useEffect(() => {
    Promise.all([invoke('getActiveConnection'), loadFields()])
      .then(([connection]) => setActiveConnection(connection && Object.keys(connection).length ? connection : null))
      .finally(() => setIsLoading(false));
  }, []);

  const rows = fields.map((field) => ({
    key: field.idSource,
    cells: [
      { key: 'name', content: field.name || '-' },
      { key: 'type', content: field.type || '-' },
      { key: 'source', content: field.idSource || '-' },
      { key: 'target', content: field.idTarget || '-' },
    ],
  }));

  return (
    <Stack space="space.300">
      <Heading as="h1">Correspondance des champs</Heading>
      <Feedback error={sync.error} success={sync.success} />
      {!activeConnection && !isLoading && (
        <SectionMessage appearance="warning">
          <Text>Aucun site cible n’est actif. Configurez-en un dans la page Configuration.</Text>
        </SectionMessage>
      )}
      <Inline space="space.100" shouldWrap>
        <LoadingButton appearance="primary" isLoading={sync.isSyncing} isDisabled={!activeConnection} onClick={sync.start}>
          Générer les correspondances
        </LoadingButton>
        <Button isDisabled={!fields.length} onClick={() => setShowCsv(true)}>Afficher le CSV</Button>
      </Inline>
      <DynamicTable
        caption="Correspondance des champs Jira"
        head={{ cells: [
          { key: 'name', content: 'Nom', isSortable: true },
          { key: 'type', content: 'Type', isSortable: true },
          { key: 'source', content: 'ID source' },
          { key: 'target', content: 'ID cible' },
        ] }}
        rows={rows}
        rowsPerPage={PAGE_SIZE}
        isLoading={isLoading || sync.isSyncing}
        emptyView={<Text>Aucune correspondance disponible.</Text>}
      />
      <ModalTransition>
        {showCsv && (
          <Modal onClose={() => setShowCsv(false)}>
            <ModalHeader><ModalTitle>Export CSV</ModalTitle></ModalHeader>
            <ModalBody>
              <Stack space="space.150">
                <Text>Sélectionnez puis copiez ce contenu dans un fichier nommé mapping_champs.csv.</Text>
                <Label labelFor="fields-csv">Contenu CSV</Label>
                <TextArea id="fields-csv" value={buildFieldsCsv(fields)} isReadOnly minimumRows={12} />
              </Stack>
            </ModalBody>
            <ModalFooter><Button appearance="primary" onClick={() => setShowCsv(false)}>Fermer</Button></ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
}

function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeConnection, setActiveConnection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkflows = async () => {
    const result = await invoke('getWorkflows', {});
    setWorkflows(result?.values || []);
  };

  const sync = useSync('workflows', loadWorkflows);

  useEffect(() => {
    Promise.all([invoke('getActiveConnection'), loadWorkflows()])
      .then(([connection]) => setActiveConnection(connection && Object.keys(connection).length ? connection : null))
      .finally(() => setIsLoading(false));
  }, []);

  const toggleSelection = (id) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  };

  const rows = workflows.map((workflow) => ({
    key: workflow.id,
    cells: [
      {
        key: 'selected',
        content: <Checkbox isChecked={selectedIds.includes(workflow.id)} onChange={() => toggleSelection(workflow.id)} label={`Sélectionner ${workflow.name}`} />,
      },
      { key: 'name', content: workflow.name || '-' },
      {
        key: 'projects',
        content: workflow.projectUsages?.length
          ? (
            <Stack space="space.050">
              {workflow.projectUsages.map((project) => {
                const projectKey = getProjectKey(project);
                return (
                  <Link key={projectKey} href={`/projects/${projectKey}/settings`} openNewTab>
                    {getProjectName(project)} ({projectKey})
                  </Link>
                );
              })}
            </Stack>
          )
          : '-',
      },
      { key: 'actions', content: <Button isDisabled>À venir</Button> },
    ],
  }));

  return (
    <Stack space="space.300">
      <Heading as="h1">Workflows</Heading>
      <Feedback error={sync.error} success={sync.success} />
      {!activeConnection && !isLoading && (
        <SectionMessage appearance="warning"><Text>Aucun site cible n’est actif.</Text></SectionMessage>
      )}
      <Inline space="space.100" shouldWrap alignBlock="center">
        <LoadingButton
          appearance="primary"
          isLoading={sync.isSyncing}
          isDisabled={!activeConnection}
          onClick={sync.start}
        >
          Récupérer les workflows
        </LoadingButton>
        {activeConnection && (
          <>
            <Button isDisabled>Générer les versions cibles</Button>
            <Button isDisabled>Migrer les workflows</Button>
          </>
        )}
        <Badge appearance="primary">{selectedIds.length} sélectionné(s)</Badge>
      </Inline>
      <DynamicTable
        caption="Workflows compatibles"
        head={{ cells: [
          { key: 'selected', content: 'Sélection' },
          { key: 'name', content: 'Nom', isSortable: true },
          { key: 'projects', content: 'Projets' },
          { key: 'actions', content: 'Actions' },
        ] }}
        rows={rows}
        rowsPerPage={PAGE_SIZE}
        isLoading={isLoading || sync.isSyncing}
        emptyView={<Text>Aucun workflow disponible.</Text>}
      />
    </Stack>
  );
}

function App() {
  const context = useProductContext();
  const page = useMemo(() => getPageFromContext(context), [context]);

  if (!context) return <Spinner label="Chargement de l’application" />;
  if (page === 'fields') return <FieldsPage />;
  if (page === 'workflows') return <WorkflowsPage />;
  return <ConfigurationPage />;
}

ForgeReconciler.render(<App />);
