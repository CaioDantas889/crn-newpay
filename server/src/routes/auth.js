import { Router } from 'express';
import { logActivity, table, update } from '../store.js';
import {
  createToken,
  hashPassword,
  publicUser,
  requireAuth,
  senhaVersao,
  validarSenha,
  verifyPassword,
} from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email = '', password = '' } = req.body ?? {};
  const user = table('users').find(
    (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
  );

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (user.active === false) {
    return res.status(403).json({ error: 'Usuário inativo. Fale com o gestor.' });
  }

  res.json({ token: createToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/**
 * POST /api/auth/senha — troca da própria senha.
 * É o caminho do primeiro acesso: quem entra com senha provisória cai aqui
 * antes de usar o CRM (mustChangePassword).
 */
router.post('/senha', requireAuth, (req, res) => {
  const { atual = '', nova = '' } = req.body ?? {};

  if (!verifyPassword(atual, req.user.password)) {
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }
  const recusa = validarSenha(nova);
  if (recusa) return res.status(400).json({ error: recusa });
  if (atual === nova) return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' });

  const atualizado = update('users', req.user.id, {
    password: hashPassword(nova),
    mustChangePassword: false,
    passwordVersion: senhaVersao(req.user) + 1,
  });

  logActivity({ userId: req.user.id, action: 'senha_alterada' });
  // A troca derruba as sessoes antigas — inclusive esta, entao vai um token novo
  // para quem acabou de trocar continuar de onde estava.
  res.json({ user: publicUser(atualizado), token: createToken(atualizado) });
});

/** Lista enxuta usada nos seletores de público-alvo e no painel do gestor */
router.get('/equipe', requireAuth, (req, res) => {
  res.json(
    table('users')
      .filter((u) => u.active !== false)
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        jobTitle: u.jobTitle,
        city: u.city,
        color: u.color,
        dailyGoal: u.dailyGoal,
      }))
  );
});

export default router;
