# Workflow Migrator

Workflow Migrator synchronise les workflows et les champs personnalisés entre deux sites Jira.

## Installation des dépendances

```sh
npm install
npm --prefix static/workflow-migrator install
```

## Tests et build du frontend

```sh
npm --prefix static/workflow-migrator test -- --watchAll=false --runInBand
npm --prefix static/workflow-migrator run build
```

Sous Windows, le script de déploiement peut préparer le frontend sans effectuer de déploiement :

```powershell
.\Deploy.ps1 -BuildOnly
```

Consultez `Deploy.ps1 -?` pour les autres options de build et de déploiement.
