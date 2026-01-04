import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { BookOpen, CheckCircle2, Clock, Plus, BarChart3 } from 'lucide-react'
import { motion } from 'framer-motion'
import './App.css'

function App() {
  const [learningList, setLearningList] = useState([
    { id: 1, title: 'React Hooks Mastery', category: 'Frontend', progress: 75, status: 'Learning' },
    { id: 2, title: 'Supabase Database Design', category: 'Backend', progress: 40, status: 'Learning' },
    { id: 3, title: 'Vite & Modern Build Tools', category: 'DevOps', progress: 100, status: 'Completed' },
  ])

  return (
    <div className="container">
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h1>LearnFlow</h1>
          <p style={{ color: '#94a3b8' }}>Journey to Mastery</p>
        </motion.div>
        <button className="add-btn">
          <Plus size={20} /> New Goal
        </button>
      </header>

      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
        <StatsCard icon={<BookOpen color="#60a5fa" />} label="In Progress" value="12" />
        <StatsCard icon={<CheckCircle2 color="#4ade80" />} label="Completed" value="48" />
        <StatsCard icon={<BarChart3 color="#a855f7" />} label="Avg. Velocity" value="85%" />
      </section>

      <div className="grid">
        {learningList.map((item, index) => (
          <motion.div
            key={item.id}
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span className="badge">{item.category}</span>
              <span style={{ fontSize: '0.875rem', color: item.status === 'Completed' ? '#4ade80' : '#94a3b8' }}>
                {item.status}
              </span>
            </div>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>{item.title}</h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.875rem' }}>
              <Clock size={14} />
              <span>Updated 2 days ago</span>
            </div>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${item.progress}%` }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
              <span>Progress</span>
              <span>{item.progress}%</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function StatsCard({ icon, label, value }) {
  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '12px' }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>{label}</p>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{value}</h2>
      </div>
    </div>
  )
}

export default App
