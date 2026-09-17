import { Router } from 'express';
import { table } from '../store.js';
import { createToken, publicUser, requireAuth, verifyPassword } from '../auth.js';

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
