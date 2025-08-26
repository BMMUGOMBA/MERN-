import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { getProject, updateProject } from '../services/storage.js'
import StatusPill from '../components/StatusPill.jsx'
import { Field } from '../components/Field.jsx'

const schema = z.object({
  owner: z.string().min(2, 'Owner is required'),
  documentedOld: z.enum(['YES','NO']).nullable(),
  documentedNew: z.enum(['YES','NO']).nullable(),
  governanceOk: z.enum(['YES','NO']).nullable(),
  workloadAssessment: z.enum(['YES','NO']).nullable(),
  quantitative: z.array(z.string().min(1)).max(3, 'Max 3'),
  qualitative: z.array(z.string().min(1)).max(3, 'Max 3'),
  requiresDocChange: z.enum(['YES','NO','NOT SURE']).nullable(),
  retrainingRequired: z.enum(['YES','NO','NOT SURE']).nullable(),
  realized: z.enum(['YES','NO','NOT SURE']).nullable(),
  roleIntegrationScope: z.enum(['YES','NO','NOT SURE']).nullable(),
  notesBenefits: z.string().optional(),
  notesRealization: z.string().optional(),
  notesRoleIntegration: z.string().optional(),
  notesOther: z.string().optional(),
  status: z.enum(['Draft','Submitted','In Review','Approved'])
})

export default function AdminAssessmentPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const proj = getProject(id)

  if (!proj) {
    return <div className="container"><div className="card">Project not found.</div></div>
  }

  const { register, control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      owner: proj.admin.owner || '',
      documentedOld: proj.admin.documentedOld,
      documentedNew: proj.admin.documentedNew,
      governanceOk: proj.admin.governanceOk,
      workloadAssessment: proj.admin.workloadAssessment,
      quantitative: proj.admin.quantitative.length ? proj.admin.quantitative : ['','',''].filter(Boolean),
      qualitative: proj.admin.qualitative.length ? proj.admin.qualitative : ['','',''].filter(Boolean),
      requiresDocChange: proj.admin.requiresDocChange,
      retrainingRequired: proj.admin.retrainingRequired,
      realized: proj.admin.realized,
      roleIntegrationScope: proj.admin.roleIntegrationScope,
      notesBenefits: proj.admin.notes.benefits,
      notesRealization: proj.admin.notes.realization,
      notesRoleIntegration: proj.admin.notes.roleIntegration,
      notesOther: proj.admin.notes.other,
      status: proj.status
    }
  })

  const quantitative = useFieldArray({ control, name: 'quantitative' })
  const qualitative = useFieldArray({ control, name: 'qualitative' })

  const onSubmit = (data) => {
    const patch = {
      admin: {
        owner: data.owner,
        documentedOld: data.documentedOld,
        documentedNew: data.documentedNew,
        governanceOk: data.governanceOk,
        workloadAssessment: data.workloadAssessment,
        quantitative: data.quantitative.filter(Boolean),
        qualitative: data.qualitative.filter(Boolean),
        requiresDocChange: data.requiresDocChange,
        retrainingRequired: data.retrainingRequired,
        realized: data.realized,
        roleIntegrationScope: data.roleIntegrationScope,
        notes: {
          benefits: data.notesBenefits || '',
          realization: data.notesRealization || '',
          roleIntegration: data.notesRoleIntegration || '',
          other: data.notesOther || ''
        }
      },
      status: data.status
    }
    updateProject(proj.id, patch)
    nav('/admin')
  }

  const YesNo = ({ name, label, error }) => (
    <Field label={label} error={error}>
      <div style={{display:'flex', gap:10}}>
        <label><input type="radio" value="YES" {...register(name)} /> YES</label>
        <label><input type="radio" value="NO" {...register(name)} /> NO</label>
      </div>
    </Field>
  )

  const YesNoNSure = ({ name, label, error }) => (
    <Field label={label} error={error}>
      <div style={{display:'flex', gap:10}}>
        <label><input type="radio" value="YES" {...register(name)} /> YES</label>
        <label><input type="radio" value="NO" {...register(name)} /> NO</label>
        <label><input type="radio" value="NOT SURE" {...register(name)} /> NOT SURE</label>
      </div>
    </Field>
  )

  return (
    <div className="container">
      <div className="card">
        <div className="toolbar">
          <div>
            <h2>Assessment: {proj.process?.processName}</h2>
            <div className="badge">Requester: {proj.requesterName} • {proj.requesterEmail}</div>
          </div>
          <StatusPill status={proj.status}/>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-2">

          <Field label="Process Owner" error={errors.owner}>
            <input className="input" {...register('owner')} placeholder="John Doe"/>
          </Field>
          <Field label="Status">
            <select {...register('status')}>
              <option>Draft</option><option>Submitted</option><option>In Review</option><option>Approved</option>
            </select>
          </Field>

          <div className="grid grid-2" style={{gridColumn:'1 / -1'}}>
            <div className="card">
              <h3>Process Modelling</h3>
              <YesNo name="documentedOld" label="Is the old process documented on ARIS?" error={errors.documentedOld}/>
              <YesNo name="governanceOk" label="Governance processes for process change?" error={errors.governanceOk}/>
            </div>
            <div className="card">
              <h3>Workload & Alignment</h3>
              <YesNo name="documentedNew" label="Is the new process documented on ARIS?" error={errors.documentedNew}/>
              <YesNo name="workloadAssessment" label="Benefits Alignment with Process Owner?" error={errors.workloadAssessment}/>
            </div>
          </div>

          <div className="grid grid-2" style={{gridColumn:'1 / -1'}}>
            <div className="card">
              <h3>Top 3 Quantitative Benefits</h3>
              {quantitative.fields.map((f, i) => (
                <div key={f.id} style={{display:'flex', gap:10, alignItems:'center', marginBottom:8}}>
                  <input className="input" placeholder={`Benefit ${i+1}`} {...register(`quantitative.${i}`)} />
                  <button type="button" className="ghost" onClick={()=>quantitative.remove(i)}>Remove</button>
                </div>
              ))}
              {quantitative.fields.length < 3 && (
                <button type="button" className="ghost" onClick={()=>quantitative.append('')}>Add</button>
              )}
            </div>

            <div className="card">
              <h3>Top 3 Qualitative Benefits</h3>
              {qualitative.fields.map((f, i) => (
                <div key={f.id} style={{display:'flex', gap:10, alignItems:'center', marginBottom:8}}>
                  <input className="input" placeholder={`Benefit ${i+1}`} {...register(`qualitative.${i}`)} />
                  <button type="button" className="ghost" onClick={()=>qualitative.remove(i)}>Remove</button>
                </div>
              ))}
              {qualitative.fields.length < 3 && (
                <button type="button" className="ghost" onClick={()=>qualitative.append('')}>Add</button>
              )}
            </div>
          </div>

          <div className="grid grid-2" style={{gridColumn:'1 / -1'}}>
            <div className="card">
              <h3>Change Management</h3>
              <YesNoNSure name="requiresDocChange" label="Does the documented process need to be changed post automation?" error={errors.requiresDocChange}/>
              <YesNoNSure name="retrainingRequired" label="Is there a need for re-training post automation?" error={errors.retrainingRequired}/>
              <YesNoNSure name="realized" label="Where the targeted benefits realized?" error={errors.realized}/>
              <YesNoNSure name="roleIntegrationScope" label="Is there scope for role integration?" error={errors.roleIntegrationScope}/>
            </div>
            <div className="card">
              <h3>Notes</h3>
              <Field label="Benefits Realization Notes" error={errors.notesBenefits}>
                <textarea rows="3" {...register('notesBenefits')} />
              </Field>
              <Field label="Role Integration Notes" error={errors.notesRoleIntegration}>
                <textarea rows="3" {...register('notesRoleIntegration')} />
              </Field>
              <Field label="Other Notes" error={errors.notesOther}>
                <textarea rows="3" {...register('notesOther')} />
              </Field>
            </div>
          </div>

          <div style={{gridColumn:'1 / -1', display:'flex', gap:10, justifyContent:'flex-end'}}>
            <button type="submit">Save Assessment</button>
            <button type="button" className="ghost" onClick={()=>nav('/admin')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
