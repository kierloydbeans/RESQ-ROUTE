from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional
from app.models.report import Report, ReportCreate, ReportRead, ReportUpdate, SeverityLevel
from app.db.session import get_session

router = APIRouter()

@router.get("/", response_model=List[ReportRead])
async def list_hazards(
    skip: int = 0,
    limit: int = 100,
    severity: Optional[SeverityLevel] = None,
    is_resolved: Optional[bool] = None,
    session: Session = Depends(get_session)
):
    query = select(Report).offset(skip).limit(limit)
    
    if severity:
        query = query.where(Report.severity == severity)
    if is_resolved is not None:
        query = query.where(Report.is_resolved == is_resolved)
    
    result = await session.execute(query)
    reports = result.scalars().all()
    return reports

@router.get("/{report_id}", response_model=ReportRead)
async def get_hazard(report_id: int, session: Session = Depends(get_session)):
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Hazard report not found")
    return report

@router.post("/", response_model=ReportRead)
async def create_hazard(
    report: ReportCreate,
    session: Session = Depends(get_session)
):
    db_report = Report.from_orm(report)
    session.add(db_report)
    await session.commit()
    await session.refresh(db_report)
    return db_report

@router.put("/{report_id}", response_model=ReportRead)
async def update_hazard(
    report_id: int,
    report_update: ReportUpdate,
    session: Session = Depends(get_session)
):
    result = await session.execute(select(Report).where(Report.id == report_id))
    db_report = result.scalar_one_or_none()
    if not db_report:
        raise HTTPException(status_code=404, detail="Hazard report not found")
    
    report_data = report_update.dict(exclude_unset=True)
    for key, value in report_data.items():
        setattr(db_report, key, value)
    
    await session.commit()
    await session.refresh(db_report)
    return db_report

@router.get("/filter/by-severity")
async def filter_by_severity(
    min_severity: SeverityLevel = Query(...),
    session: Session = Depends(get_session)
):
    severity_order = {
        SeverityLevel.LOW: 0,
        SeverityLevel.MEDIUM: 1,
        SeverityLevel.HIGH: 2,
        SeverityLevel.CRITICAL: 3
    }
    
    min_level = severity_order[min_severity]
    result = await session.execute(select(Report))
    reports = result.scalars().all()
    
    filtered = [
        report for report in reports 
        if severity_order.get(report.severity, 0) >= min_level
    ]
    
    return filtered
