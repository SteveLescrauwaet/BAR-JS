# JS Dottignies • Bar — PWA Supabase

Version web/PWA de la caisse du bar, prévue pour plusieurs appareils connectés au même projet Supabase (2 tablettes, PC du bar, PC distant).

## Fonctions incluses

- Vente comptoir avec panier et catégories.
- Paiement **Espèces** (vert) et **Carte / SumUp** (orange).
- **Offert par le bar** protégé par code administrateur et journalisé avec « offert par ».
- **Conso arbitre** : retire le stock, ne crée pas de CA et conserve le coût marchandises.
- Sorties de caisse : arbitre officiel / non officiel, nom, équipe, heure et montant.
- Stock central partagé, stock de départ, achats/réapprovisionnements, corrections, alerte <= 10 %.
- Produits : prix de vente, prix d'achat, photo, activation et ordre d'affichage.
- Ordre des catégories modifiable dans l'administration.
- Fond de caisse par pièces/billets.
- Historique par date, détails des tickets, suppression admin et restauration du stock.
- Calcul du bénéfice net : **CA - coût marchandises - sorties de caisse**.
- Synchronisation Supabase Realtime entre les appareils.
- Authentification Supabase et droits `cashier` / `admin` via RLS.
- Installation PWA depuis le navigateur.

> Le logo fourni dans `assets/icons/club-logo.svg` est un visuel provisoire. Remplace-le par le logo officiel du club si tu veux conserver exactement ton identité graphique.

---

## 1. Créer la base Supabase

Tu as déjà créé ton projet Supabase. Dans le Dashboard Supabase :

1. Ouvre **SQL Editor**.
2. Clique **New query**.
3. Copie tout le contenu de `supabase/schema.sql` et exécute-le.
4. Crée une seconde query avec `supabase/seed.sql` et exécute-la.

Le `seed.sql` crée les produits initiaux avec **20 unités en stock** pour les tests.

### Créer les comptes

Dans **Authentication > Users**, crée au minimum :

- un compte pour la caisse/tablettes, par exemple `caisse@tonclub.be` ;
- un compte administrateur, par exemple `admin@tonclub.be`.

Après création du compte admin, exécute dans **SQL Editor** :

```sql
update public.profiles
set role = 'admin', display_name = 'Steve'
where email = 'admin@tonclub.be';
```

Adapte l'adresse et le nom. Un compte normal reste en rôle `cashier`.

Le code administrateur initial pour **Offert par le bar** est `2026`. Il peut ensuite être changé dans **Administration > Paramètres**.

---

## 2. Lier l'application à Supabase

Dans Supabase, ouvre le bouton **Connect** de ton projet et copie :

- **Project URL** ;
- la clé **Publishable** (`sb_publishable_...`).

Ouvre ensuite :

`assets/js/config.js`

et remplace :

```js
window.JSD_BAR_CONFIG = {
  supabaseUrl: 'https://TON-PROJET.supabase.co',
  supabasePublishableKey: 'sb_publishable_REMPLACE_MOI'
};
```

par tes vraies valeurs, par exemple :

```js
window.JSD_BAR_CONFIG = {
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabasePublishableKey: 'sb_publishable_xxxxxxxxxxxxxxxxx'
};
```

**Ne mets jamais une clé `secret` ou `service_role` dans la PWA.** Le navigateur utilise uniquement la clé publishable ; la sécurité des données repose sur l'authentification et les politiques RLS déjà créées par `schema.sql`.

---

## 3. Tester sur le PC avant GitHub

Sous Windows, double-clique sur :

`start-local.bat`

ou lance dans PowerShell depuis le dossier :

```powershell
py -m http.server 8080
```

Puis ouvre :

`http://localhost:8080`

Évite d'ouvrir directement `index.html` en `file://`, car les fonctions PWA/service worker ne fonctionnent pas correctement dans ce mode.

---

## 4. Envoyer l'application sur ton dépôt GitHub

Si ton dépôt GitHub existe déjà mais que tu n'as pas encore cloné le projet :

```powershell
git clone https://github.com/TON-COMPTE/TON-DEPOT.git
```

Copie **le contenu de ce dossier PWA** dans le dossier cloné, puis :

```powershell
git add .
git commit -m "Version PWA JS Dottignies Bar"
git push
```

Si ton dossier local est déjà lié au dépôt :

```powershell
git add .
git commit -m "Version PWA JS Dottignies Bar"
git push origin main
```

---

## 5. Activer GitHub Pages

Sur GitHub :

1. Ouvre ton dépôt.
2. **Settings > Pages**.
3. Dans **Build and deployment**, choisis **Deploy from a branch**.
4. Branche : `main`.
5. Dossier : `/ (root)`.
6. Clique **Save**.

Après quelques instants GitHub affiche l'adresse publique, généralement :

`https://TON-COMPTE.github.io/TON-DEPOT/`

L'application utilise uniquement des chemins relatifs, donc elle fonctionne aussi dans un sous-dossier GitHub Pages.

Dans Supabase, tu peux ensuite mettre cette même adresse dans **Authentication > URL Configuration > Site URL**. Ce n'est pas nécessaire au simple login par mot de passe, mais c'est utile pour les futurs liens de récupération de mot de passe.

---

## 6. Installation sur les tablettes

1. Ouvre l'adresse GitHub Pages dans Chrome/Edge sur la tablette.
2. Connecte-toi avec le compte caisse.
3. Utilise **Installer** si le bouton apparaît, ou le menu du navigateur > **Installer l'application / Ajouter à l'écran d'accueil**.
4. Clique sur le nom de l'appareil et donne un nom clair : `BAR 1`, `BAR 2`, `PC BAR`, etc.

Les ventes, stocks, sorties de caisse, offerts et consommations arbitres seront enregistrés dans le même Supabase et les modifications de catalogue/stock seront rafraîchies via Realtime.

---

## 7. Photos des produits

Les photos ajoutées dans **Administration > Produits & tarifs** sont envoyées dans le bucket Supabase Storage `product-images`, créé automatiquement par `schema.sql`.

Les produits de départ utilisent un visuel texte tant qu'aucune photo n'a été importée.

---

## 8. Structure du projet

```text
jsd-bar-pwa/
├─ index.html
├─ manifest.webmanifest
├─ service-worker.js
├─ start-local.bat
├─ .nojekyll
├─ .gitignore
├─ README.md
├─ assets/
│  ├─ css/
│  │  └─ app.css
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ config.js
│  │  └─ config.example.js
│  └─ icons/
│     ├─ club-logo.svg
│     ├─ icon-192.png
│     └─ icon-512.png
└─ supabase/
   ├─ schema.sql
   └─ seed.sql
```

## Important

Cette version a été préparée comme première conversion fonctionnelle de l'application Flutter vers une PWA. Avant une journée de match réelle, fais un test complet avec les deux tablettes : vente simultanée, annulation admin, stock, sorties de caisse, offert, conso arbitre et fond de caisse.


## Prix d’achat / revient initiaux

Le fichier `supabase/seed.sql` contient désormais les prix d’achat moyens de départ pour tous les produits.

Si la base Supabase a déjà été initialisée avant cette mise à jour, exécuter une seule fois `supabase/patch_product_cost_prices.sql` dans **Supabase > SQL Editor**. Ce patch met uniquement à jour `products.cost_price` et ne touche pas aux stocks, prix de vente ou historiques.
