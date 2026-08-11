import { Link } from 'react-router-dom'

const panels = [
  { to: '/admin/login', code: 'A', title: 'Админ панели', text: 'Ресторанды, менюну жана кызматкерлерди башкаруу.' },
  { to: '/waiter/login', code: 'O', title: 'Официант панели', text: 'Столдорду, чакырууларды жана даяр заказдарды тейлөө.' },
  { to: '/kitchen/login', code: 'K', title: 'Ашкана панели', text: 'Заказдарды даярдоо жана алардын статусун өзгөртүү.' },
]

export default function LoginHubPage() {
  return <main className="login-hub-page"><section><header><span>D</span><div><strong>Dastorkon</strong><small>Кызматкерлер үчүн кирүү</small></div></header><div className="login-hub-copy"><small>ПАНЕЛДИ ТАНДАҢЫЗ</small><h1>Системага кирүү</h1><p>Кардарлар аккаунтсуз QR меню аркылуу заказ беришет.</p></div><div className="login-hub-grid">{panels.map((panel) => <Link to={panel.to} key={panel.to}><span>{panel.code}</span><div><h2>{panel.title}</h2><p>{panel.text}</p></div><b>→</b></Link>)}</div></section></main>
}
