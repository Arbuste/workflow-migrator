# Workflow Migrator

Workflow Migrator synchronise les workflows et les champs personnalisés entre deux sites Jira.

L’interface d’administration utilise le rendu natif Standard UI Kit de Forge. Elle ne nécessite aucun build Custom UI séparé.

## Installation des dépendances

```sh
npm install
```

## Tests et validation

```sh
npm test
forge lint
```

Sous Windows, le script de déploiement peut valider l’application sans effectuer de déploiement :

```powershell
.\Deploy.ps1 -BuildOnly
```

Consultez `Deploy.ps1 -?` pour les autres options de build et de déploiement.
