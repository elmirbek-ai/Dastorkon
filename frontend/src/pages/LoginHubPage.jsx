import { Link } from 'react-router-dom'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getRoleLabel } from '../i18n/index.js'

export default function LoginHubPage() {
  const { language, t } = useLanguage()
  const panels = [
    { to: '/admin/login', code: 'A', title: getRoleLabel('ADMIN', language), text: t('auth.adminPanelHelp') }, { to: '/waiter/login', code: 'O', title: getRoleLabel('WAITER', language), text: t('auth.waiterPanelHelp') }, { to: '/kitchen/login', code: 'K', title: getRoleLabel('KITCHEN', language), text: t('auth.kitchenPanelHelp') },
  ]
  return <main className="login-hub-page"><section><header><span>D</span><div className="login-hub-brand"><strong>Dastorkon</strong><small>{t('auth.restaurantOS')}</small></div><LanguageSwitch /></header><div className="login-hub-copy"><small>{t('auth.staffOnly')}</small><h1>{t('auth.staffLogin')}</h1><p>{t('auth.hubDescription')}</p></div><div className="login-hub-grid">{panels.map((panel) => <Link to={panel.to} key={panel.to}><span>{panel.code}</span><div><h2>{panel.title}</h2><p>{panel.text}</p></div><b>→</b></Link>)}</div></section></main>
}
