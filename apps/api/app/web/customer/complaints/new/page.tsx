'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import {
  COMPLAINT_IMAGE_MAX_BYTES,
  COMPLAINT_IMAGE_MIME_TYPES,
  COMPLAINT_MAX_IMAGES,
  COMPLAINT_OTHER_CATEGORY,
  ComplaintCreateRequestSchema,
  type Complaint,
  type ComplaintCategory,
} from '@parking/shared';

import { Banner } from '../../../_components/Banner';
import { Field } from '../../../_components/Field';
import { apiRequest, errorMessage } from '../../../_lib/api';
import { applyApiError, safeParseForm, type FieldErrors } from '../../../_lib/validation';

const MAX_MB = COMPLAINT_IMAGE_MAX_BYTES / (1024 * 1024);

export default function RaiseComplaintPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<ComplaintCategory[] | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiRequest<ComplaintCategory[]>('/api/complaint-categories');
        if (!cancelled) setCategories(rows);
      } catch (error) {
        if (!cancelled) {
          setCategories([]);
          setFormError(errorMessage(error, 'Could not load the list of issues.'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const isOther = categoryId === COMPLAINT_OTHER_CATEGORY;

  const onPickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ''; // let the same file be picked again after removal

    const allowed = COMPLAINT_IMAGE_MIME_TYPES as readonly string[];
    const bad = picked.find((file) => !allowed.includes(file.type) || file.size > COMPLAINT_IMAGE_MAX_BYTES);
    if (bad) {
      setFieldErrors((current) => ({ ...current, images: `Images must be JPEG, PNG or WebP, up to ${MAX_MB} MB each.` }));
      return;
    }
    const next = [...images, ...picked];
    if (next.length > COMPLAINT_MAX_IMAGES) {
      setFieldErrors((current) => ({ ...current, images: `You can attach up to ${COMPLAINT_MAX_IMAGES} images.` }));
    } else {
      setFieldErrors((current) => ({ ...current, images: '' }));
    }
    setImages(next.slice(0, COMPLAINT_MAX_IMAGES));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = safeParseForm(ComplaintCreateRequestSchema, {
      categoryId,
      customTitle: isOther ? customTitle : undefined,
      description,
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const body = new FormData();
      body.set('categoryId', parsed.data.categoryId);
      if (isOther && parsed.data.customTitle) body.set('customTitle', parsed.data.customTitle);
      body.set('description', parsed.data.description);
      images.forEach((file) => body.append('images', file));

      const created = await apiRequest<Complaint>('/api/complaints', { method: 'POST', body });
      router.push(`/web/customer/complaints/${created.id}`);
    } catch (error) {
      setFormError(applyApiError(error, setFieldErrors));
    } finally {
      setSubmitting(false);
    }
  };

  if (categories === null) return <div className="loading-center">Loading…</div>;

  return (
    <div className="stack-loose">
      <h1 className="text-heading">Raise a complaint</h1>

      {formError ? <Banner kind="danger">{formError}</Banner> : null}

      <form className="stack" onSubmit={onSubmit}>
        <Field label="What is the issue?" htmlFor="categoryId" error={fieldErrors.categoryId}>
          <select
            id="categoryId"
            className={`select${fieldErrors.categoryId ? ' has-error' : ''}`}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Select an issue…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
            <option value={COMPLAINT_OTHER_CATEGORY}>Other</option>
          </select>
        </Field>

        {isOther ? (
          <Field label="Issue title" htmlFor="customTitle" error={fieldErrors.customTitle}>
            <input
              id="customTitle"
              className={`input${fieldErrors.customTitle ? ' has-error' : ''}`}
              placeholder="Briefly name the issue"
              maxLength={120}
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Description" htmlFor="description" error={fieldErrors.description}>
          <textarea
            id="description"
            className={`textarea${fieldErrors.description ? ' has-error' : ''}`}
            rows={5}
            maxLength={1000}
            placeholder="Tell us what happened — include booking or pass details if relevant."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field
          label="Images (optional)"
          htmlFor="images"
          error={fieldErrors.images}
          hint={`Up to ${COMPLAINT_MAX_IMAGES} images, JPEG/PNG/WebP, ${MAX_MB} MB each.`}
        >
          <div className="stack">
            {previews.map((url, index) => (
              <div className="stack" key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview URL */}
                <img src={url} alt={`Attachment ${index + 1}`} className="screenshot-preview" />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            {images.length < COMPLAINT_MAX_IMAGES ? (
              <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
                {images.length === 0 ? 'Attach images' : 'Add another image'}
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              id="images"
              type="file"
              multiple
              accept={COMPLAINT_IMAGE_MIME_TYPES.join(',')}
              onChange={onPickFiles}
              style={{ display: 'none' }}
            />
          </div>
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit complaint'}
        </button>
      </form>
    </div>
  );
}
