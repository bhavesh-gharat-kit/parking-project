'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { formatIstDate, type PassDocument, type PassVehicleCategory } from '@parking/shared';

import { Banner } from '../../../../_components/Banner';
import { apiRequest, errorMessage } from '../../../../_lib/api';

/**
 * The 13-point rules poster (`_/by-client/instructions.jpeg`) as page 2.
 * Fixed content, not per-pass data (Phase 22 deliverable 3), so it is static
 * copy here rather than fetched — same Marathi text as the poster, the two
 * promotional blocks at the bottom ("Digital Pass System", "Complaint Box")
 * left out per `_/decisions.md` D5.
 */
const INSTRUCTIONS: string[] = [
  'प्रवेश मार्ग किंवा इतर वाहनांच्या मार्गात वाहन सोडू नये.',
  'हँडल लॉक करू नये. ब्रेक अँड वन दे व्यवस्थापकाच्या सूचनेनुसार.',
  'आपले पास स्टिकर निर्देशित जागेतच लावून ठेवावे.',
  'दीर्घकाळ वाहन पार्क करायचे असल्यास व्यवस्थापकास कळवावे.',
  'वाहन/वस्तूंचे नुकसान, चोरी इत्यादीसाठी व्यवस्थापन जबाबदार राहणार नाही.',
  'पार्किंग परिसरात कचरा किंवा घाण करू नये.',
  'कोणतीही तक्रार असल्यास कॅश काउंटरवर वाद न घालता तक्रार नोंदवून नोंद करावी.',
  'भरलेली फी/पास शुल्क परत मिळणार नाही. (स्वतःहून मागितलेली)',
  'व्यवस्थापनाने दिलेल्या सर्व सूचनांचे पालन करणे आवश्यक आहे.',
  'प्रत्येक वेळी आत-बाहेर प्रवेश करताना पास स्टिकर दाखविणे तसेच रजिस्टरमध्ये नोंद करणे किंवा स्वतः करून घेणे.',
  'विशेष सवलत/सन्मान योजना: वाहनधारकाकडून सूचना, निर्देश, आधुनिक तंत्रज्ञान इत्यादी वाहनतळाबाबत माहिती प्राप्त झाल्यास वाहनधारकांना योजनेचा लाभ घेता येईल.',
  'हा फॉर्म भरल्यानंतर माहिती तपासून पार्किंग पास स्टिकर तयार करण्यात येईल.',
  'आपण आपली वाहने ठरवून दिलेल्या ब्लॉक जागेत पार्क करावी. इतर ठिकाणी ठेवलेली वाहने नुकसान झाल्यास किंवा गैरसोय झाल्यास व्यवस्थापनाला जबाबदार धरणे येणार नाही.',
  '30 मी पेक्षा जास्त काळ वाहन धारकांचे खर्च होत असतील तर त्या दिवसाचे पैसे पुढच्या महिन्यात ट्रान्सफर करण्यात येतील(T&C)',
  'महिन्यातून 20 पेक्षा कमी वेळ वाहन पार्क करणार्यांना शुल्क परत देण्यात येईल(महिन्याअखेर ठरवण्यात येईल)'
];

/** Row 4 वाहन प्रकार — only these four categories have their own box on the
 *  paper form; everything else (`CAR`/`RICKSHAW`/`OTHER`) ticks इतर below. */
const VEHICLE_ICON_CATEGORIES: { key: PassVehicleCategory; label: string }[] = [
  { key: 'BULLET', label: 'BULLET' },
  { key: 'AVENGER', label: 'AVENGER' },
  { key: 'SCOOTY', label: 'SCOOTY' },
  { key: 'SPORTS', label: 'SPORTS' },
];

const OTHER_VEHICLE_LABELS: Record<string, string> = {
  CAR: 'Car',
  RICKSHAW: 'Rickshaw',
  OTHER: 'Other',
};

/** Field 13 व्यवसाय — `occupationCategory` is a real enum (customer feedback
 *  after Phase 20 shipped: it used to be free text matched against these
 *  icons by regex; now it's a select, so this is a straight label lookup). */
const OCCUPATION_MARATHI_LABELS: Record<Exclude<PassDocument['occupationCategory'], null | 'OTHER'>, string> = {
  LAWYER: 'वकील',
  SERVANT: 'नोकर',
  DEVOTEE: 'भाविक',
  BUSINESSMAN: 'व्यापारी',
  SENIOR_CITIZEN: 'ज्येष्ठ नागरिक',
};

function Boxes({ value, length }: { value: string; length: number }) {
  const chars = value.slice(0, length).split('');
  return (
    <span className="pass-boxes">
      {Array.from({ length }, (_, index) => (
        <span className="pass-box" key={index}>
          {chars[index] ?? ''}
        </span>
      ))}
    </span>
  );
}

function Check({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className={`pass-check${checked ? ' checked' : ''}`}>
      <span className="pass-check-box">{checked ? '✓' : ''}</span>
      {label}
    </span>
  );
}

function Row({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="pass-row">
      <span className="pass-row-num">{n}</span>
      <span className="pass-row-label">{label}</span>
      <span className="pass-row-body">{children}</span>
    </div>
  );
}

export default function PassDocumentPage() {
  const { id } = useParams<{ id: string }>();

  const [doc, setDoc] = useState<PassDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDoc(await apiRequest<PassDocument>(`/api/passes/${id}/document`));
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this pass document.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; retry buttons call the same stable callback outside an effect
    void load();
  }, [load]);

  if (doc === null) {
    return (
      <div className="stack-loose">
        {loadError ? (
          <>
            <Banner kind="danger">{loadError}</Banner>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <div className="loading-center">Loading…</div>
        )}
      </div>
    );
  }

  return (
    <div className="stack-loose">
      <div className="btn-row no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Download / print pass
        </button>
        <Link href={`/web/admin/passes/${id}`} className="btn btn-ghost">
          ← Back to pass
        </Link>
      </div>

      <div className="pass-doc">
        {/* ── Page 1 — recreates pass-photo.jpeg's right-page layout ──── */}
        <section className="pass-page">
          <div className="pass-header">
            <div className="pass-header-top">
              <span className="pass-crest" aria-hidden>
                P
              </span>
              <div className="pass-header-text">
                <p className="pass-header-title">कल्याण डोंबिवली महानगरपालिका</p>
                <p className="pass-header-subtitle">बेरागावर वाडी, कल्याण रेल्वे स्टेशन समोर</p>
              </div>
              <span className="pass-parking-badge">
                <span>P</span>
                <span>
                  PARKING
                  <br />
                  SAFE &amp; SECURE
                </span>
              </span>
            </div>
            <div className="pass-header-bottom">
              <p className="pass-header-form-title">पे - ॲण्ड - पार्क (PAY &amp; PARK)</p>
              <span className="pass-service-badge">दिवसा-रात्र सेवा</span>
            </div>
          </div>

          <div className="pass-receipt-row">
            <span>पावती क्रमांक : {doc.passNumber}</span>
            <span>दिनांक : {formatIstDate(doc.createdAt)}</span>
          </div>

          <Row n={1} label="वाहन क्रमांक :">
            <Boxes value={doc.vehicleNumber} length={12} />
            <Check checked={doc.shiftType === 'DAY' || doc.shiftType === 'BOTH'} label="दिवस" />
            <Check checked={doc.shiftType === 'NIGHT' || doc.shiftType === 'BOTH'} label="रात्र" />
          </Row>

          <Row n={2} label="वेळ :">
            <span>येण्याची वेळ : {doc.entryTime ?? '____ : ____'}</span>
            <span>जाण्याची वेळ : {doc.exitTime ?? '____ : ____'}</span>
          </Row>

          <Row n={3} label="पेमेंट पद्धत :">
            <Check checked={doc.paymentMethod === 'CASH'} label="Cash" />
            <Check checked={doc.paymentMethod === 'UPI'} label="G-Pay / UPI" />
          </Row>

          <Row n={4} label="वाहन प्रकार :">
            {VEHICLE_ICON_CATEGORIES.map((category) => (
              <Check key={category.key} checked={doc.vehicleCategory === category.key} label={category.label} />
            ))}
            <Check
              checked={!VEHICLE_ICON_CATEGORIES.some((category) => category.key === doc.vehicleCategory)}
              label={`इतर${OTHER_VEHICLE_LABELS[doc.vehicleCategory] ? ` (${OTHER_VEHICLE_LABELS[doc.vehicleCategory]})` : ''}`}
            />
          </Row>

          <Row n={5} label="वर्गीकरण :">
            <Check checked={doc.specification === 'SPECIAL'} label="विशेष" />
            <Check checked={doc.specification === 'GENERAL'} label="सामान्य" />
            <Check checked={doc.specification === 'ODD'} label="विषम" />
          </Row>

          <Row n={6} label="मोबाईल क्रमांक :">
            <Boxes value={doc.mobileNumber} length={10} />
          </Row>

          <Row n={7} label="पत्ता :">
            <span className="pass-value-text">{doc.address}</span>
          </Row>

          <Row n={8} label="सुट्टी / Holiday :">
            <span>महिन्यातून एकूण {doc.expectedParkingDays ?? '___'} दिवस पार्किंग</span>
            <span>सुट्टीचे दिवस :</span>
            <Check checked={doc.holidayOffDay === 'SUNDAY'} label="रविवार" />
            <Check checked={doc.holidayOffDay === 'SATURDAY'} label="शनिवार" />
            <Check
              checked={doc.holidayOffDay === 'OTHER'}
              label={doc.holidayOffDay === 'OTHER' && doc.holidayOffDayOther ? `इतर (${doc.holidayOffDayOther})` : 'इतर'}
            />
          </Row>

          <Row n={9} label="पासाचा प्रकार :">
            <Check checked={!doc.renewalReference} label="नवीन पास" />
            <Check checked={Boolean(doc.renewalReference)} label="जुना पास" />
            <span>खेप : {doc.renewalReference ?? ''}</span>
          </Row>

          <Row n={10} label="पास दिनांक :">
            <span>{formatIstDate(doc.startDate)}</span>
            <span>वैधता : {formatIstDate(doc.endDate)}</span>
          </Row>

          <Row n={11} label="सुविधा :">
            <Check checked={doc.helmet} label="हेल्मेट" />
            <Check checked={doc.locker} label="लॉकर" />
            <Check checked={doc.airCheck} label="एअर चेक" />
            <Check checked={doc.rickshawParking} label="रिक्षा पार्किंग" />
          </Row>

          <Row n={12} label="प्रवेश मार्ग :">
            <span className="pass-entry-row">
              <span className={`pass-entry-option${doc.entrySide === 'ST_STAND' ? ' active' : ''}`}>ST STAND</span>
              <span className={`pass-entry-option${doc.entrySide === 'COURT_SIDE' ? ' active' : ''}`}>
                COURT SIDE
              </span>
            </span>
          </Row>

          <Row n={13} label="व्यवसाय :">
            {(Object.entries(OCCUPATION_MARATHI_LABELS) as [keyof typeof OCCUPATION_MARATHI_LABELS, string][]).map(
              ([key, label]) => (
                <Check key={key} checked={doc.occupationCategory === key} label={label} />
              ),
            )}
            <Check
              checked={doc.occupationCategory === 'OTHER'}
              label={doc.occupationCategory === 'OTHER' && doc.occupationOther ? `इतर (${doc.occupationOther})` : 'इतर'}
            />
          </Row>

          <Row n={14} label="यु. टी. आर. क्रमांक :">
            <Boxes value={doc.upiUtr ?? ''} length={16} />
          </Row>

          
          <div className="pass-receipt-row">
            <span></span>
            <span>T & C मागे पहा</span>
          </div>
          
        </section>

        {/* ── Page 2 — the 13-point instructions, nothing else (D5) ──── */}
        <section className="pass-page pass-instructions">
          <h2>सूचना</h2>
          <ol className="pass-instructions-list">
            {INSTRUCTIONS.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
