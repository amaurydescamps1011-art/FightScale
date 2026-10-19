/* Les services en memoire qui remplacent Supabase, Resend et Google quand on
   eprouve `logique.ts` : le meme contrat (`Deps` dans logique.ts), sans
   reseau. Partages par rdv.test.mjs et rdv_local.mjs. */
import { randomUUID } from 'node:crypto';
import { ErreurDoublon } from '../../supabase/functions/rdv/logique.ts';

/** une table `rendez_vous` dans un tableau, avec ses deux contraintes :
    l'unicite du debut parmi les `confirme`, et celle du token */
export function baseMemoire() {
  const lignes = [];
  const iso = (d) => (d instanceof Date ? d.toISOString() : d);
  return {
    lignes,
    async confirmesEntre(de, a) {
      return lignes
        .filter((l) => l.statut === 'confirme' && l.debut >= iso(de) && l.debut < iso(a))
        .map((l) => ({ debut: l.debut, fin: l.fin }));
    },
    async creer(n) {
      if (lignes.some((l) => l.statut === 'confirme' && l.debut === n.debut)) throw new ErreurDoublon();
      if (lignes.some((l) => l.token_annulation === n.token_annulation)) throw new ErreurDoublon();
      const l = {
        evenement_google: null, lien_meet: null, rappel_envoye_le: null, annule_le: null,
        ...n,
        id: n.id || randomUUID(),
        cree_le: n.cree_le || new Date().toISOString(),
        statut: n.statut || 'confirme',
      };
      lignes.push(l);
      return { ...l };
    },
    async parToken(token) {
      const l = lignes.find((x) => x.token_annulation === token);
      return l ? { ...l } : null;
    },
    async marqueAnnule(id, quand) {
      const l = lignes.find((x) => x.id === id && x.statut === 'confirme');
      if (!l) return null;
      l.statut = 'annule';
      l.annule_le = iso(quand);
      return { ...l };
    },
    async aRappeler(de, a) {
      return lignes
        .filter((l) => l.statut === 'confirme' && l.rappel_envoye_le === null && l.debut > iso(de) && l.debut <= iso(a))
        .map((l) => ({ ...l }));
    },
    async marqueRappel(id, quand) {
      const l = lignes.find((x) => x.id === id && x.rappel_envoye_le === null);
      if (!l) return false;
      l.rappel_envoye_le = iso(quand);
      return true;
    },
    async libereRappel(id) {
      const l = lignes.find((x) => x.id === id);
      if (l) l.rappel_envoye_le = null;
    },
    async compteRecents(email, ipHash, depuis) {
      const recents = lignes.filter((l) => l.cree_le >= iso(depuis));
      return {
        parEmail: recents.filter((l) => l.email.toLowerCase() === email.toLowerCase()).length,
        parIp: ipHash ? recents.filter((l) => l.ip_hash === ipHash).length : 0,
      };
    },
    async majGoogle(id, champs) {
      const l = lignes.find((x) => x.id === id);
      if (l) Object.assign(l, champs);
    },
  };
}

/** garde les courriels au lieu de les envoyer ; `panne` fait echouer l'envoi */
export function courrierMemoire(options = {}) {
  const envoyes = [];
  return {
    envoyes,
    panne: !!options.panne,
    async envoie(c) {
      if (this.panne) throw new Error('resend 503');
      envoyes.push(c);
      if (options.surEnvoi) await options.surEnvoi(c);
    },
  };
}

/** un agenda Google simule : des plages occupees, un faux lien Meet, et des
    pannes qu'on declenche a volonte */
export function googleSimule(options = {}) {
  const crees = [], supprimes = [];
  return {
    crees, supprimes,
    occupes_: options.occupes || [],
    panneCreation: !!options.panneCreation,
    panneOccupes: !!options.panneOccupes,
    panneSuppression: !!options.panneSuppression,
    async occupes() {
      if (this.panneOccupes) throw new Error('google 500');
      return this.occupes_;
    },
    async creeEvenement(e) {
      if (this.panneCreation) throw new Error('google 500');
      const id = 'evt_' + randomUUID().slice(0, 8);
      const lien_meet = e.meet ? 'https://meet.google.com/' + id.slice(4, 7) + '-' + id.slice(7, 11) + '-abc' : null;
      crees.push({ id, lien_meet, ...e });
      return { id, lien_meet };
    },
    async supprimeEvenement(id) {
      if (this.panneSuppression) throw new Error('google 500');
      supprimes.push(id);
    },
  };
}

/** un journal qui garde tout, pour verifier qu'aucune donnee personnelle n'y passe */
export function journalMemoire() {
  const entrees = [];
  const f = (niveau, message, detail) => { entrees.push({ niveau, message, detail: detail || {} }); };
  f.entrees = entrees;
  return f;
}
