import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { waiterApiClient, WAITER_TOKEN_KEY } from '../api/client.js'
import LanguageSwitch from '../components/LanguageSwitch.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import { getBackendErrorMessage, getRoleLabel } from '../i18n/index.js'
import { getAvatarInitial } from '../utils/avatar.js'

function formatDateTime(value, language, dateOnly = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ky-KG', dateOnly ? {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  } : {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function DetailItem({ label, value }) {
  return <div className="waiter-profile-detail"><dt>{label}</dt><dd>{value || '—'}</dd></div>
}

function KpiCard({ label, value }) {
  return <article className="waiter-profile-kpi"><span>{label}</span><strong>{value ?? '—'}</strong></article>
}

function StatisticRow({ label, value }) {
  return <div className="waiter-profile-stat-row"><span>{label}</span><strong>{value ?? '—'}</strong></div>
}

export default function WaiterProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const logoutExpired = useCallback(() => {
    localStorage.removeItem(WAITER_TOKEN_KEY)
    navigate('/waiter/login', {
      replace: true,
      state: { authError: t('auth.sessionExpired') },
    })
  }, [navigate, t])

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const response = await waiterApiClient.get('/api/waiter/profile/', {
        params: { lang: language },
      })
      setData(response.data)
      setError('')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logoutExpired()
        return
      }
      setError(getBackendErrorMessage(requestError, language))
    } finally {
      setLoading(false)
    }
  }, [language, logoutExpired])

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0)
    return () => window.clearTimeout(timer)
  }, [loadProfile])

  if (loading) {
    return <main className="waiter-profile-page waiter-profile-page--state"><span className="waiter-screen-spinner" /><strong>{t('common.loading')}</strong></main>
  }

  if (!data) {
    return <main className="waiter-profile-page waiter-profile-page--state"><p role="alert">{error || t('waiterProfile.noData')}</p><button type="button" onClick={loadProfile}>{t('common.tryAgain')}</button></main>
  }

  const { profile, shift_summary: shift, recent_shifts: recentShifts, work_stats: stats } = data
  const avatarInitial = getAvatarInitial(profile.first_name, profile.username)

  return (
    <main className="waiter-profile-page">
      <header className="waiter-profile-page-header">
        <button className="waiter-back-icon-button" type="button" onClick={() => navigate('/waiter/dashboard')} aria-label={t('common.back')} title={t('common.back')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
        </button>
        <div><strong>{t('waiterProfile.myProfile')}</strong><small>@{profile.username}</small></div>
      </header>

      <div className="waiter-profile-page-content">
        {error && <div className="waiter-profile-message is-error" role="alert">{error}</div>}
        {location.state?.profileUpdated && <div className="waiter-profile-message is-success" role="status">{t('waiterProfile.updateSuccess')}</div>}

        <section className="waiter-profile-summary">
          <span className="waiter-profile-photo" aria-hidden="true">{avatarInitial}</span>
          <div className="waiter-profile-summary-copy">
            <h1>{profile.full_name || profile.username}</h1>
            <small>@{profile.username}</small>
            <div className="waiter-profile-summary-statuses">
              <span>{getRoleLabel(profile.role, language)}</span>
              <span className={profile.is_active ? 'is-success' : 'is-muted'}>{profile.is_active ? t('waiterProfile.active') : t('waiterProfile.inactive')}</span>
              {shift.is_on_shift && <span className="is-success">{t('waiterProfile.currentlyOnShift')}</span>}
            </div>
          </div>
          <button type="button" onClick={() => navigate('/waiter/profile/edit')}>{t('waiterProfile.editProfile')}</button>
        </section>

        <section className="waiter-profile-quick-stats" aria-labelledby="waiter-quick-stats-title">
          <header><small>{t('waiterProfile.profile')}</small><h2 id="waiter-quick-stats-title">{t('waiterProfile.mainIndicators')}</h2></header>
          <div className="waiter-profile-kpi-grid">
            <KpiCard label={t('waiterProfile.workedToday')} value={shift.today_worked_display} />
            <KpiCard label={t('waiterProfile.last7Days')} value={shift.last_7_days_worked_display} />
            <KpiCard label={t('waiterProfile.deliveredOrders')} value={stats.delivered_orders_count} />
            <KpiCard label={t('waiterProfile.acceptedTables')} value={stats.accepted_tables_count} />
          </div>
        </section>

        <section className="waiter-profile-section">
          <header><div><small>{t('waiterProfile.todayShift')}</small><h2>{t('waiterProfile.shiftSummary')}</h2></div>{shift.is_on_shift && <span className="is-active">{t('waiterProfile.currentlyOnShift')}</span>}</header>
          <div className="waiter-profile-stat-list">
            <StatisticRow label={t('waiterProfile.startedAt')} value={formatDateTime(shift.today_shift_started_at, language)} />
            <StatisticRow label={t('waiterProfile.finishedAt')} value={shift.is_on_shift ? t('waiterProfile.stillWorking') : formatDateTime(shift.today_shift_ended_at, language)} />
            <StatisticRow label={t('waiterProfile.workedToday')} value={shift.today_worked_display} />
            <StatisticRow label={t('waiterProfile.last30Days')} value={shift.last_30_days_worked_display} />
            <StatisticRow label={t('waiterProfile.totalShifts')} value={shift.total_shifts_count} />
          </div>
        </section>

        <section className="waiter-profile-section">
          <header><div><small>{t('waiterProfile.work')}</small><h2>{t('waiterProfile.workStatistics')}</h2></div></header>
          <div className="waiter-profile-stat-list">
            <StatisticRow label={t('waiterProfile.acceptedTablesCount')} value={stats.accepted_tables_count} />
            <StatisticRow label={t('waiterProfile.deliveredOrdersCount')} value={stats.delivered_orders_count} />
            <StatisticRow label={t('waiterProfile.resolvedCalls')} value={stats.resolved_waiter_calls_count} />
            <StatisticRow label={t('waiterProfile.todayActiveTables')} value={stats.today_active_tables_count} />
            <StatisticRow label={t('waiterProfile.readyNotDelivered')} value={stats.today_ready_not_delivered_orders_count} />
            <StatisticRow label={t('waiterProfile.averageDeliveryTime')} value={stats.average_order_delivery_time_display} />
          </div>
        </section>

        <section className="waiter-profile-section">
          <header><div><small>{t('waiterProfile.workedDays')}</small><h2>{t('waiterProfile.workHistory')}</h2></div></header>
          {recentShifts.length === 0 ? <p className="waiter-profile-empty">{t('waiterProfile.noShifts')}</p> : (
            <div className="waiter-shift-history">
              {recentShifts.map((item) => (
                <article key={item.id}>
                  <div><strong>{formatDateTime(item.date, language, true)}</strong>{item.is_active && <span>{t('waiterProfile.activeShift')}</span>}</div>
                  <dl>
                    <DetailItem label={t('waiterProfile.startTime')} value={formatDateTime(item.started_at, language)} />
                    <DetailItem label={t('waiterProfile.endTime')} value={item.is_active ? t('waiterProfile.stillWorking') : formatDateTime(item.ended_at, language)} />
                    <DetailItem label={t('waiterProfile.duration')} value={item.duration_display} />
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="waiter-profile-section">
          <header><div><small>{t('waiterProfile.account')}</small><h2>{t('waiterProfile.personalInformation')}</h2></div></header>
          <dl className="waiter-profile-personal-grid">
            <DetailItem label={t('waiterProfile.firstName')} value={profile.first_name} />
            <DetailItem label={t('waiterProfile.lastName')} value={profile.last_name} />
            <DetailItem label={t('waiterProfile.primaryPhone')} value={profile.primary_phone || profile.phone} />
            <DetailItem label={t('waiterProfile.secondaryPhone')} value={profile.secondary_phone} />
            <DetailItem label={t('waiterProfile.role')} value={getRoleLabel(profile.role, language)} />
            <DetailItem label={t('waiterProfile.accountStatus')} value={profile.is_active ? t('waiterProfile.active') : t('waiterProfile.inactive')} />
            <DetailItem label={t('waiterProfile.joinedDate')} value={formatDateTime(profile.date_joined, language, true)} />
            <DetailItem label={t('waiterProfile.lastLogin')} value={formatDateTime(profile.last_login, language)} />
          </dl>
        </section>

        <section className="waiter-profile-section waiter-profile-settings-section">
          <header><div><small>{t('waiterProfile.profile')}</small><h2>{t('waiterProfile.interfaceLanguage')}</h2></div><button type="button" onClick={() => navigate('/waiter/menu-availability')}>{t('waiter.menuAvailability')}</button></header>
          <div className="waiter-profile-language-setting">
            <p>{t('waiterProfile.interfaceLanguageDescription')}</p>
            <LanguageSwitch />
          </div>
        </section>
      </div>
    </main>
  )
}
