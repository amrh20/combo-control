import type { CartProblem } from '../models/ops-create-order.model';

const MINIMUM_ORDER_CODES = new Set(['SHOP_BELOW_MINIMUM', 'BELOW_MINIMUM']);

export function isMinimumOrderProblem(problem: CartProblem): boolean {
  return MINIMUM_ORDER_CODES.has(problem.code);
}

/** Arabic copy for cart validation problems from the ops order API. */
export function cartProblemMessage(problem: CartProblem): string {
  if (isMinimumOrderProblem(problem)) {
    return '';
  }

  switch (problem.code) {
    case 'SHOP_CLOSED':
      return 'المحل مش بيستقبل طلبات دلوقتي';
    case 'PRODUCT_UNAVAILABLE':
      return 'المنتج خلص';
    case 'INVALID_OPTIONS':
      return 'اختار الحجم/الوزن';
    case 'MULTIPLE_HUBS':
      return 'السلة فيها محلات من مناطق مختلفة';
    case 'SHOP_NOT_SERVING_ADDRESS':
      return 'المحل مش بيوصّل للعنوان ده';
    case 'ADDRESS_NOT_SERVED':
      return 'مش بنوصل للعنوان ده';
    case 'PRODUCT_NOT_FOUND':
      return 'المنتج مش موجود';
    case 'VENDOR_MISMATCH':
      return 'المنتج مش تابع للمحل المحدد';
    default:
      return problem.message?.trim() || 'في مشكلة في السلة';
  }
}

export function formatCartProblems(problems: readonly CartProblem[]): string {
  return problems
    .map(cartProblemMessage)
    .filter((message) => message.length > 0)
    .join(' — ');
}
