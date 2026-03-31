# Yahtzee Marché

Jeu web multijoueur en temps réel pour GitHub Pages + Firebase Realtime Database.

## Ce que fait cette version

- salle/lobby avec lien partageable
- 1 à 7 joueurs
- ordre des tours selon l’arrivée dans la salle
- 13 x nombre de joueurs tours globaux
- score final = score Yahtzee + pièces restantes
- enchères privées après le 2e lancer
- une seule offre par joueur
- vendeur voit toutes les offres et peut en accepter une
- vente: le vendeur gagne les pièces, perd le tour, l’acheteur récupère le roll du 2e lancer et termine le tour
- cases Yahtzee classiques + bonus supérieur de 35
- bonus Yahtzee +100 implémenté
- interface simple en français

## Limites de cette version MVP

- sécurité applicative minimale: comme il n’y a pas de backend serveur, les règles métier vivent côté client
- pas de système d’authentification fort, juste un identifiant local + pseudo
- l’exclusion d’un joueur est simple et directe
- pas de chat intégré
- pas de gestion avancée anti-triche

Pour jouer entre amis rapidement sur GitHub Pages, c’est une base correcte. Pour une vraie version robuste/publique, il faudra ajouter Auth + règles Firebase plus strictes + Cloud Functions.

---

## Installation locale

```bash
npm install
cp .env.example .env
npm run dev
```

Ensuite ouvre l’URL donnée par Vite.

---

## Déploiement de A à Z sur GitHub Pages

### 1. Créer un projet Firebase

1. Va dans la console Firebase.
2. Crée un projet.
3. Ajoute une application Web.
4. Active **Realtime Database**.
5. Copie la configuration Web Firebase.

### 2. Mettre des règles temporaires pour tester

Dans Realtime Database > Rules, mets temporairement:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

⚠️ Pour un MVP entre amis uniquement. À durcir ensuite.

### 3. Créer le dépôt GitHub

1. Crée un repo GitHub, par exemple `yahtzee-market`.
2. Mets tous les fichiers de ce dossier dedans.
3. Push sur la branche `main`.

### 4. Ajouter les secrets GitHub

Dans GitHub > Settings > Secrets and variables > Actions, ajoute:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### 5. Activer GitHub Pages

Dans GitHub > Settings > Pages:

- Source: **GitHub Actions**

Le workflow `.github/workflows/deploy.yml` fera le build et le déploiement.

### 6. Lancer le déploiement

Fais un push sur `main`.
GitHub Actions va construire le projet puis publier le dossier `dist`.

### 7. URL finale

Après déploiement, ton site sera disponible sur l’URL GitHub Pages du repo.

---

## Développement

### Structure

- `src/App.jsx` : logique principale du jeu
- `src/firebase.js` : connexion Firebase
- `src/styles.css` : styles
- `.github/workflows/deploy.yml` : publication GitHub Pages

### Commandes

```bash
npm install
npm run dev
npm run build
npm run preview
```

---

## Améliorations conseillées ensuite

- reconnexion propre si refresh
- présence temps réel plus fiable
- règles Firebase plus strictes
- historique des parties
- animations de dés
- écran de fin plus détaillé
- protection contre doubles clics et actions simultanées
