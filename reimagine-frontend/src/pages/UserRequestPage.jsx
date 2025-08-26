import React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext.jsx'
import { createProject } from '../services/storage.js'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/Field.jsx'

const schema = z.object({
  processName: z.string().min(2, 'Required'),
  businessUnit: z.string().min(1, 'Required'),
  requesterName: z.string().min(2, 'Required'),
  requesterEmail: z.string().email('Invalid email'),
  rolesImpacted: z.string().optional(),
  systemsImpacted: z.string().optional(),
  percentAutomated: z.coerce.number().min(0).max(100),
  staffImpacted: z.coerce.number().min(0),
  frequency: z.string().min(1, 'Required'),
  breadth: z.coerce.number().min(0),
  cycleTime: z.string().min(1),
  complexitySystems: z.coerce.number().min(0),
  manHoursPerMonth: z.coerce.number().min(0)
})

export default function UserRequestPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      requesterName: user?.name || '',
      requesterEmail: user?.email || '',
      percentAutomated: 0,
      staffImpacted: 0, breadth: 0, complexitySystems: 0, manHoursPerMonth: 0
    }
  })

  const onSubmit = (data) => {
    const payload = {
      requesterEmail: data.requesterEmail,
      requesterName: data.requesterName,
      process: {
        processName: data.processName,
        businessUnit: data.businessUnit,
        rolesImpacted: data.rolesImpacted,
        systemsImpacted: data.systemsImpacted,
        percentAutomated: data.percentAutomated,
        staffImpacted: data.staffImpacted,
        sizing: {
          frequency: data.frequency,
          breadth: data.breadth,
          cycleTime: data.cycleTime,
          complexitySystems: data.complexitySystems,
          manHoursPerMonth: data.manHoursPerMonth
        }
      },
      // initial empty admin data
      admin: {
        owner: '',
        documentedOld: null,
        documentedNew: null,
        governanceOk: null,
        workloadAssessment: null,
        quantitative: [],
        qualitative: [],
        requiresDocChange: null,
        retrainingRequired: null,
        realized: null,
        roleIntegrationScope: null,
        notes: { benefits: '', roleIntegration: '', realization: '', other: '' }
      },
      status: 'Submitted'
    }
    const project = createProject(payload)
    nav(`/admin?created=${project.id}`)
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Automation Benefits Realization – Request</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-2">
          <Field label="Process Name" error={errors.processName}>
            <input className="input" {...register('processName')} placeholder="Customer Onboarding"/>
          </Field>
          <Field label="Business Unit" error={errors.businessUnit}>
            <input className="input" {...register('businessUnit')} placeholder="PPB"/>
          </Field>

          <Field label="Requester Name" error={errors.requesterName}>
            <input className="input" {...register('requesterName')} />
          </Field>
          <Field label="Requester Email" error={errors.requesterEmail}>
            <input className="input" type="email" {...register('requesterEmail')} />
          </Field>

          <Field label="Roles impacted" description="Comma-separated" error={errors.rolesImpacted}>
            <input className="input" {...register('rolesImpacted')} placeholder="Role 1, Role 2"/>
          </Field>
          <Field label="Systems impacted" description="Comma-separated" error={errors.systemsImpacted}>
            <input className="input" {...register('systemsImpacted')} placeholder="System 1, System 2"/>
          </Field>

          <Field label="% of process automated" error={errors.percentAutomated}>
            <input className="input" type="number" step="1" {...register('percentAutomated')} />
          </Field>
          <Field label="Number of staff impacted" error={errors.staffImpacted}>
            <input className="input" type="number" {...register('staffImpacted')} />
          </Field>

          <hr className="grid-span-2" />

          <Field label="How often is the process performed (Interval)" error={errors.frequency}>
            <select {...register('frequency')}>
              <option value="">Select…</option>
              <option>Daily</option><option>Weekly</option><option>Monthly</option><option>Ad-hoc</option>
            </select>
          </Field>
          <Field label="How many staff members are performing this process (Breadth)" error={errors.breadth}>
            <input className="input" type="number" {...register('breadth')} />
          </Field>
          <Field label="How long does one cycle take? (Cycle Time)" error={errors.cycleTime}>
            <input className="input" placeholder="e.g., 20 minutes" {...register('cycleTime')} />
          </Field>
          <Field label="How many systems are involved? (Complexity)" error={errors.complexitySystems}>
            <input className="input" type="number" {...register('complexitySystems')} />
          </Field>
          <Field label="How many man-hours per month? (Size)" error={errors.manHoursPerMonth}>
            <input className="input" type="number" {...register('manHoursPerMonth')} />
          </Field>

          <div style={{gridColumn:'1 / -1', display:'flex', gap:10, justifyContent:'flex-end', marginTop:6}}>
            <button type="submit">Submit Request</button>
            <button type="reset" className="ghost">Reset</button>
          </div>
        </form>
      </div>
    </div>
  )
}
