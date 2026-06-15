-- 총괄관리 작성 근태신청서는 중간 결재 없이 관리자 승인대기로 직행합니다.
-- 이미 부서장 승인대기로 저장된 기존 건을 보정할 때 실행하세요.
update attendance_requests ar
set status = '관리자 승인대기'
from app_users au
where ar.requested_by = au.user_id
  and ar.status = '부서장 승인대기'
  and (
    au.role = 'CHIEF'
    or au.approval_role = '총괄관리'
  );
