# Ataraxie - Plateforme de Révision Médicale

Bienvenue sur **Ataraxie**, une application web interactive et haute performance conçue spécifiquement pour les étudiants préparant les examens médicaux (FMP). Ataraxie vous permet de suivre votre progression de manière granulaire, de gérer d'innombrables profils de travail, et de confronter vos réponses à des corrections officielles grâce à un moteur de comparaison intelligent.

---

## 🚀 Commencer
L'application fonctionne entièrement en local dans votre navigateur.
Pour la lancer, ouvrez simplement le fichier `index.html` ou utilisez un serveur local (ex: `npx http-server -p 8080`). Aucune base de données externe n'est requise ; toutes vos données sont cryptées de manière sécurisée dans la mémoire de votre navigateur (LocalStorage).

---

## 📖 Guide d'Utilisation Étape par Étape

### 1. La Navigation et la Barre Latérale (Sidebar)
L'intelligence d'Ataraxie repose sur l'arborescence de la barre latérale gauche, qui centralise l'exhaustivité de votre cursus médical.
* **L'Arborescence** : Le menu est divisé par **Matières** (Modules) et **Chapitres**.
* **Recherche Globale** : Utilisez la barre de recherche (icône loupe) en haut du panneau pour filtrer instantanément les modules existants par mots-clés ou numéros de chapitre.
* **Indicateurs de Progression** : À droite de chaque module/chapitre, un badge (ex: `12/50`) vous montre en direct la proportion de questions du chapitre auxquelles vous avez déjà répondu. Le badge devient vert une fois le chapitre achevé à 100%.

### 2. Mode Étude : Répondre aux Questions
Une fois un chapitre sélectionné, les questions s'affichent sous forme de flux continu ou "cartes" (Cards). L'enregistrement de vos réponses est **silencieux et instantané (auto-save)**.
* **Cartes QCM** : Cliquez librement sur les propositions (A, B, C, D...) pour les sélectionner ou les désélectionner. 
* **Cartes Rédactionnelles** : Pour les questions ouvertes (cas cliniques, QROC), une zone de texte intelligente vous permet de rédiger et sauvegarder automatiquement votre réflexion.
* **La Validation (Bouton Stratégique)** : En bas de chaque question se trouve un bouton **"Marquer comme validée"**. Une question "Validée" indique au système que vous êtes confiant(e) et sûr(e) de cette réponse. *Attention : Le statut de validation est la clé de voûte de l'auto-correction (voir plus bas).*

### 3. Le Centre de Comparaison Analytique (Comparison Hub)
C'est la fonctionnalité phare d'Ataraxie. Si vous souhaitez vérifier vos réponses pour le chapitre en cours, cliquez sur le bouton de balance en haut à droite de l'écran (*Comparer mes réponses*). Un panneau s'ouvrira pour comparer vos choix à une autre source de vérité.
* **Menu Sélection de la Source** : Dans le menu déroulant en haut de ce panneau, vous pouvez comparer la page actuelle avec :
  1. *🌟 Corrections Officielles* : Exploite la base de données de correction pour le chapitre.
  2. *Profil Actif Local* : L'un de vos autres profils (ex: un profil "Khôlle" vs un profil "Brouillon").
  3. *📂 Importer un fichier...* : Charge la sauvegarde (JSON) d'un ami ou d'un tuteur.
* **L'Auto-Correction Intelligente (Le système de Couleurs)** :
  * Si la source sélectionnée (ex: "Corrections Officielles") a le statut **"Validée"** pour la question observée, l'application considère cette source comme **La Pure Vérité** (une coche ✔️ verte apparaît).
  * L'application transforme le panneau en correcteur : elle scanne l'écran et **irradie de Vert** les options exactes que vous avez malencontreusement oubliées (Faux Négatifs), et **irradie de Rouge** les erreurs que vous avez cochées à tort (Faux Positifs).

### 4. Gestion des Profils (Profiles)
Ataraxie gère des profils multiples mathématiquement isolés. 
* Ouvrez le **Gestionnaire de Profils** en cliquant sur l'avatar circulaire tout en bas de la barre de navigation.
* **Créer / Renommer** : Idéal pour refaire des TDs à zéro.
* **Copier** : Permet de dupliquer toute la progression d'un profil "A" dans un profil "B". Très utile pour sauvegarder un brouillon de vos réponses exactes avant de procéder à des modifications drastiques expérimentales.
* **Navigation Fluide** : Changer de profil ne vous ramène plus brutalement à l'écran d'Accueil. Si vous êtes sur un chapitre précis et changez de profil, l'application se mettra instantanément à jour avec les réponses du nouveau profil ciblé sans jamais vous faire perdre la page des yeux.

### 5. Page d'Accueil & Historique Intégré
En cliquant sur le large logo "A - Ataraxie" en haut à gauche, vous retournerez à l'Accueil.
* L'Accueil abrite un **Tableau d'Historique** intelligent des sujets récemment traités. 
* **Loi de l'Interaction** : L'historique ne sera jamais spammé par vos simples "visites" ou de brèves lectures de chapitres. Ataraxie n'y placera que les chapitres où vous avez *activement interagi* avec l'interface (cliquer sur une option QCM, taper un mot, ou valider une question).
* Cliquez sur n'importe quelle carte de cet historique pour relancer le module. L'application **scrollera automatiquement** et vous recentrera sur la toute dernière question où vous vous étiez physiquement arrêté !

### 6. Exportation & Importation (Sauvegardes et Conflits)
Sur la barre latérale inférieure, 3 outils d'administration sont à votre disposition :
* **Exporter** : Génère un fichier ultra-léger (ex: `Nom_Du_Profil-24-03-2026.json`) contenant tout votre historique d'options, textes et validations. Il est recommandé de s'en servir régulièrement ou pour s'échanger des corrections entre étudiants.
* **Importer** : Permet de restaurer une progression ou d'importer une version supérieure ! Lors de l'importation de la progression d'un ami, Ataraxie détectera tous les conflits potentiels par rapport à ce que vous avez déjà coché. Un panneau de **Gestion de Conflits** s'ouvrira, vous permettant de faire le tri question par question.
* **Réinitialiser** : Un outil chirurgical. Vous pouvez vider complètement le profil pour repartir de 0, ou opter pour **l'effacement par matière** : très pratique si vous voulez tout garder mais recommencer uniquement l'hématologie, par exemple.

---

**Bon courage pour vos révisions !** 🧠🩺
