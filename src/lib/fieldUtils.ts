import { nextTick } from 'vue';

export const focusInput = async (ref: { $el?: { querySelector: (selector: string) => HTMLElement | null } } | null, selector = 'input', autoSelect = true) => {
  await nextTick();
  const element = ref?.$el?.querySelector(selector) as HTMLInputElement | null;
  if (element) {
    element.focus();
    if (autoSelect) {
      await nextTick();
      element.select();
    }
  }
};

export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayDate = (): string => {
  return formatDate(new Date());
};

export const getYesterdayDate = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDate(yesterday);
};
