/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bilingual Translation & RTL Support Service (Phase 14.7)
 * English / Arabic (العربية) UI Chrome, Tabs, Actions & Clinical Terms.
 */

export type Language = 'en' | 'ar';

export interface Translations {
  [key: string]: {
    en: string;
    ar: string;
  };
}

export const DICTIONARY: Translations = {
  // App Navigation
  'nav.dashboard': { en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.schedules': { en: 'Schedules', ar: 'الجداول والمناوبات' },
  'nav.availability': { en: 'Availability & Leave', ar: 'التوافر والإجازات' },
  'nav.nurses': { en: 'Nursing Staff', ar: 'الكادر التمريضي' },
  'nav.doctors': { en: 'Doctors & Clinics', ar: 'عيادات الأطباء' },
  'nav.history': { en: 'Version History', ar: 'سجل الإصدارات' },
  'nav.publish': { en: 'Publish & Email', ar: 'النشر والإشعارات' },
  'nav.reports': { en: 'Reports & Payroll', ar: 'التقارير والرواتب' },
  'nav.audit': { en: 'Audit Trail', ar: 'سجل التدقيق' },
  'nav.settings': { en: 'Settings', ar: 'إعدادات العيادة' },

  // Top Bar & Global Chrome
  'topbar.localMode': { en: 'Local Mode', ar: 'الوضع المحلي' },
  'topbar.cloudMode': { en: 'Cloud Sync Active', ar: 'المزامنة السحابية نشطة' },
  'topbar.warnings': { en: 'Warnings', ar: 'التنبيهات' },
  'topbar.shortcuts': { en: 'Shortcuts', ar: 'اختصارات المفاتيح' },
  'topbar.darkMode': { en: 'Dark Mode', ar: 'الوضع الليلي' },
  'topbar.lightMode': { en: 'Light Mode', ar: 'الوضع المضيء' },
  'topbar.language': { en: 'Language', ar: 'اللغة' },

  // Workbook Ribbon Toolbar
  'ribbon.save': { en: 'Save', ar: 'حفظ' },
  'ribbon.diff': { en: 'Diff History', ar: 'مقارنة التغييرات' },
  'ribbon.export': { en: 'Export ▾', ar: 'تصدير ▾' },
  'ribbon.publish': { en: 'Publish ▾', ar: 'نشر ▾' },
  'ribbon.share': { en: 'Share', ar: 'مشاركة' },
  'ribbon.undo': { en: 'Undo', ar: 'تراجع' },
  'ribbon.redo': { en: 'Redo', ar: 'إعادة' },
  'ribbon.copy': { en: 'Copy', ar: 'نسخ' },
  'ribbon.paste': { en: 'Paste', ar: 'لصق' },
  'ribbon.lock': { en: 'Lock', ar: 'تثبيت' },
  'ribbon.unlock': { en: 'Unlock', ar: 'إلغاء التثبيت' },
  'ribbon.clear': { en: 'Clear', ar: 'مسح' },
  'ribbon.generateAll': { en: 'Generate All', ar: 'توليد كامل' },
  'ribbon.emptyOnly': { en: 'Empty Only', ar: 'تعبئة الشواغر' },
  'ribbon.rebalance': { en: 'Fairness Rebalance', ar: 'إعادة موازنة العدالة' },
  'ribbon.swap': { en: 'Shift Swap', ar: 'تبديل مناوبة' },
  'ribbon.templates': { en: 'Templates', ar: 'القوالب' },

  // Workbook Bottom Tabs
  'tab.roster': { en: 'Roster Grid', ar: 'شبكة المناوبات' },
  'tab.doctors': { en: "Doctors' Schedule", ar: 'جدول الأطباء' },
  'tab.coverage': { en: 'Hourly Coverage', ar: 'التغطية بالساعات' },
  'tab.warnings': { en: 'Warnings & Audit', ar: 'التنبيهات والمخالفات' },
  'tab.leaveLocks': { en: 'Leave & Locks', ar: 'الإجازات والمثبتات' },
  'tab.hours': { en: 'Hours Accounting', ar: 'محاسبة الساعات' },
  'tab.legend': { en: 'Legend & Codes', ar: 'دليل الرموز' },

  // Clinical Roster Terms
  'term.contractTarget': { en: 'Target Hours', ar: 'الساعات المستهدفة' },
  'term.earnedHours': { en: 'Earned Hours', ar: 'الساعات المنجزة' },
  'term.leaveCredit': { en: 'Leave Credits', ar: 'رصيد الإجازات' },
  'term.seniorNurse': { en: 'Senior Nurse', ar: 'ممرض أول / مسؤول' },
  'term.fullDay': { en: 'Full Day (09:00–21:00)', ar: 'يوم كامل (٠٩:٠٠–٢١:٠٠)' },
  'term.lateDuty': { en: 'Late Duty (11:00–21:00)', ar: 'دوام مسائي (١١:٠٠–٢١:٠٠)' },
  'term.earlyDuty': { en: 'Early Duty (08:00–16:00)', ar: 'دوام صباحي (٠٨:٠٠–١٦:٠٠)' },
  'term.phlebotomy': { en: 'Blood Collection & IV', ar: 'سحب الدم والوريد' },
  'term.overtime': { en: 'Overtime', ar: 'ساعات إضافية' },
  'term.underhours': { en: 'Under Hours', ar: 'عجز الساعات' },
};

class I18nManager {
  private currentLang: Language = 'en';
  private listeners: ((lang: Language) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('clinic_roster_language') as Language;
      if (saved === 'ar' || saved === 'en') {
        this.currentLang = saved;
      }
      this.applyDomDirection();
    }
  }

  public getLanguage(): Language {
    return this.currentLang;
  }

  public setLanguage(lang: Language): void {
    if (this.currentLang === lang) return;
    this.currentLang = lang;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinic_roster_language', lang);
      this.applyDomDirection();
    }
    this.notify();
  }

  public toggleLanguage(): void {
    this.setLanguage(this.currentLang === 'en' ? 'ar' : 'en');
  }

  public t(key: string, defaultText?: string): string {
    const item = DICTIONARY[key];
    if (!item) return defaultText || key;
    return item[this.currentLang] || defaultText || key;
  }

  public subscribe(cb: (lang: Language) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb(this.currentLang);
    }
  }

  private applyDomDirection(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.currentLang;
      document.documentElement.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
    }
  }
}

export const i18n = new I18nManager();
export const t = (key: string, defaultText?: string) => i18n.t(key, defaultText);
