import { useState } from 'react';
import AppShell from '../components/AppShell';
import {
  Download, FileText, Calendar, BarChart2, PieChart,
  TrendingUp, Filter
} from 'lucide-react';
import {
  MOCK_REPORT_SUMMARY, MOCK_REPORT_CHART,
  MOCK_REPORT_STATUS, MOCK_REPORTS_ARCHIVE
} from '../data/mockData';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart as RPieChart,
  Pie, Cell
} from 'recharts';

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  ready: { cls: 'badge success', label: 'Ready' },
  draft: { cls: 'badge warning', label: 'Draft' },
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(row => row.map(value => {
    const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('7d');
  const s = MOCK_REPORT_SUMMARY;

  return (
    <AppShell pageTitle="Reports" pageSubtitle="Operational analytics and sample report data">
      {/* Date filter */}
      <div className="filter-bar">
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: '24h', label: '24h' },
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: 'custom', label: 'Custom' },
          ].map(opt => (
            <button
              key={opt.key}
              className={`btn btn-sm ${dateRange === opt.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setDateRange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('tadoba-sample-reports.csv', [
            ['ID', 'Report Name', 'Type', 'Period', 'Author', 'Status'],
            ...MOCK_REPORTS_ARCHIVE.map(report => [report.id, report.name, report.type, report.period, report.author, report.status]),
          ])}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="responsive-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Alerts Received', value: s.alertsReceived, icon: BarChart2, iconCls: 'red' },
          { label: 'Missions Completed', value: s.missionsCompleted, icon: TrendingUp, iconCls: 'blue' },
          { label: 'Identity Reviews', value: s.identityReviews, icon: PieChart, iconCls: 'green' },
          { label: 'Alerts Resolved', value: s.alertsResolved, icon: Filter, iconCls: 'amber' },
        ].map(item => (
          <div key={item.label} className="stat-card">
            <div className={`stat-card-icon ${item.iconCls}`}>
              <item.icon />
            </div>
            <div>
              <div className="stat-card-label">{item.label}</div>
              <div className="stat-card-value">{String(item.value).padStart(2, '0')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="responsive-two-column responsive-charts" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 20 }}>
        {/* Bar chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Alerts Trend (7 days)</span>
          </div>
          <div style={{ padding: '16px 20px', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_REPORT_CHART} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    background: 'white', border: '1px solid var(--color-card-border)',
                    borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="received" name="Received" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#2d6a4f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Alert Resolution</span>
          </div>
          <div style={{ padding: '16px 20px', height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={180}>
              <RPieChart>
                <Pie
                  data={MOCK_REPORT_STATUS}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={70}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="none"
                >
                  {MOCK_REPORT_STATUS.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'white', border: '1px solid var(--color-card-border)',
                    borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
              </RPieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {MOCK_REPORT_STATUS.map(entry => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color }} />
                  <span>{entry.name} ({entry.pct}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Report archive */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><FileText size={14} style={{ marginRight: 6 }} />Report Archive</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Report Name</th>
              <th>Type</th>
              <th>Period</th>
              <th>Author</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MOCK_REPORTS_ARCHIVE.map(report => (
              <tr key={report.id}>
                <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{report.id}</td>
                <td>{report.name}</td>
                <td><span className="badge neutral" style={{ fontSize: 10 }}>{report.type}</span></td>
                <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  <Calendar size={11} style={{ marginRight: 4 }} />{report.period}
                </td>
                <td>{report.author}</td>
                <td>
                  {STATUS_BADGE[report.status] && (
                    <span className={STATUS_BADGE[report.status].cls} style={{ fontSize: 10 }}>{STATUS_BADGE[report.status].label}</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" aria-label={`Download ${report.name} sample data`} title="Download this sample report row as CSV" onClick={() => downloadCsv(`${report.id.toLowerCase()}-sample.csv`, [
                    ['ID', 'Report Name', 'Type', 'Period', 'Author', 'Status'],
                    [report.id, report.name, report.type, report.period, report.author, report.status],
                  ])}>
                    <Download size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
