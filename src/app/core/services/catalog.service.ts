import { Injectable, signal } from '@angular/core';

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
}

const PRODUCT_IMAGES = {
  kabsa:   'https://placehold.co/400x300/E8F5E9/1B5E20?text=%D9%83%D8%A8%D8%B3%D8%A9',
  shawarma:'https://placehold.co/400x300/FFF3E0/E65100?text=%D8%B4%D8%A7%D9%88%D8%B1%D9%85%D8%A7',
  salad:   'https://placehold.co/400x300/E8F5E9/2E7D32?text=%D8%B3%D9%84%D8%B7%D8%A9',
  coffee:  'https://placehold.co/400x300/EFEBE9/4E342E?text=%D9%82%D9%87%D9%88%D8%A9',
  croissant:'https://placehold.co/400x300/FFF8E1/F9A825?text=%D9%83%D8%B1%D9%88%D8%A7%D8%B3%D8%A7%D9%86',
  milk:    'https://placehold.co/400x300/E3F2FD/1565C0?text=%D8%AD%D9%84%D9%8A%D8%A8',
  eggs:    'https://placehold.co/400x300/FFFDE7/F9A825?text=%D8%A8%D9%8A%D8%B6',
  bread:   'https://placehold.co/400x300/EFEBE9/6D4C41?text=%D8%AE%D8%A8%D8%B2',
  pharma:  'https://placehold.co/400x300/E8EAF6/283593?text=%D8%AF%D9%88%D8%A7%D8%A1',
  fruit:   'https://placehold.co/400x300/FCE4EC/C62828?text=%D9%81%D8%A7%D9%83%D9%87%D8%A9',
  snack:   'https://placehold.co/400x300/FFF3E0/EF6C00?text=%D9%88%D8%AC%D8%A8%D8%A7%D8%AA',
  gadget:  'https://placehold.co/400x300/ECEFF1/37474F?text=%D8%A5%D9%84%D9%83%D8%AA%D8%B1%D9%88%D9%86%D9%8A%D8%A7%D8%AA',
  juice:   'https://placehold.co/400x300/E0F7FA/00838F?text=%D8%B9%D8%B5%D9%8A%D8%B1',
  grilled: 'https://placehold.co/400x300/FFEBEE/B71C1C?text=%D9%85%D8%B4%D8%A7%D9%88%D9%8A',
  pastry:  'https://placehold.co/400x300/F3E5F5/6A1B9A?text=%D9%85%D8%B9%D8%AC%D9%86%D8%A7%D8%AA',
};

const CATALOG_DATA: Product[] = [
  // ── مطعم البيت (SH-001) ──────────────────────────────────────────
  {
    id: 'PR-001', shopId: 'SH-001', name: 'كبسة دجاج',
    description: 'كبسة دجاج على الطريقة النجدية مع مكسرات وزبيب.',
    price: 45, category: 'أطباق رئيسية', imageUrl: PRODUCT_IMAGES.kabsa, isAvailable: true,
  },
  {
    id: 'PR-002', shopId: 'SH-001', name: 'سلطة فتوش',
    description: 'خضار طازجة مع خبز محمص ودبس الرمان.',
    price: 18, category: 'مقبلات', imageUrl: PRODUCT_IMAGES.salad, isAvailable: true,
  },
  {
    id: 'PR-003', shopId: 'SH-001', name: 'عصير ليمون بالنعناع',
    description: 'عصير ليمون طازج مع أوراق نعناع.',
    price: 12, category: 'مشروبات', imageUrl: PRODUCT_IMAGES.juice, isAvailable: true,
  },
  {
    id: 'PR-004', shopId: 'SH-001', name: 'مندي لحم',
    description: 'مندي لحم ضأن مطهو على الفحم.',
    price: 85, category: 'أطباق رئيسية', imageUrl: PRODUCT_IMAGES.grilled, isAvailable: false,
  },

  // ── كافيه الصباح (SH-002) ────────────────────────────────────────
  {
    id: 'PR-005', shopId: 'SH-002', name: 'لاتيه كراميل',
    description: 'إسبريسو مع حليب مبخّر وصوص كراميل.',
    price: 22, category: 'مشروبات ساخنة', imageUrl: PRODUCT_IMAGES.coffee, isAvailable: true,
  },
  {
    id: 'PR-006', shopId: 'SH-002', name: 'كروسان بالزبدة',
    description: 'كروسان فرنسي طازج من الفرن.',
    price: 14, category: 'معجنات', imageUrl: PRODUCT_IMAGES.croissant, isAvailable: true,
  },
  {
    id: 'PR-007', shopId: 'SH-002', name: 'آيس أمريكانو',
    description: 'قهوة أمريكانو مثلّجة.',
    price: 16, category: 'مشروبات باردة', imageUrl: PRODUCT_IMAGES.coffee, isAvailable: true,
  },

  // ── بقالة النور (SH-003) ─────────────────────────────────────────
  {
    id: 'PR-008', shopId: 'SH-003', name: 'حليب كامل الدسم ٢ لتر',
    description: 'حليب طازج كامل الدسم.',
    price: 12, category: 'ألبان', imageUrl: PRODUCT_IMAGES.milk, isAvailable: true,
  },
  {
    id: 'PR-009', shopId: 'SH-003', name: 'بيض طازج (١٢)',
    description: 'علبة بيض طازج ١٢ حبة.',
    price: 18, category: 'أساسيات', imageUrl: PRODUCT_IMAGES.eggs, isAvailable: true,
  },
  {
    id: 'PR-010', shopId: 'SH-003', name: 'خبز توست',
    description: 'رغيف توست أبيض طازج.',
    price: 7, category: 'مخبوزات', imageUrl: PRODUCT_IMAGES.bread, isAvailable: true,
  },
  {
    id: 'PR-011', shopId: 'SH-003', name: 'شيبس Lays',
    description: 'شيبس بطاطس بنكهة الكلاسيك.',
    price: 9, category: 'وجبات خفيفة', imageUrl: PRODUCT_IMAGES.snack, isAvailable: false,
  },

  // ── صيدلية الرعاية (SH-004) ──────────────────────────────────────
  {
    id: 'PR-012', shopId: 'SH-004', name: 'باراسيتامول ٥٠٠ ملغ',
    description: 'مسكن وخافض للحرارة — عبوة ٢٠ قرص.',
    price: 15, category: 'أدوية', imageUrl: PRODUCT_IMAGES.pharma, isAvailable: true,
  },
  {
    id: 'PR-013', shopId: 'SH-004', name: 'فيتامين سي فوّار',
    description: 'مكمل غذائي فيتامين سي ١٠٠٠ ملغ.',
    price: 28, category: 'مكملات', imageUrl: PRODUCT_IMAGES.pharma, isAvailable: true,
  },

  // ── مطعم لذة الشام (SH-005) ──────────────────────────────────────
  {
    id: 'PR-014', shopId: 'SH-005', name: 'شاورما مشكل',
    description: 'شاورما دجاج ولحم مع ثوم ومخلل.',
    price: 32, category: 'ساندويتشات', imageUrl: PRODUCT_IMAGES.shawarma, isAvailable: true,
  },
  {
    id: 'PR-015', shopId: 'SH-005', name: 'حمص باللحمة',
    description: 'حمص كريمي مع لحم مفروم محمر.',
    price: 28, category: 'مقبلات', imageUrl: PRODUCT_IMAGES.salad, isAvailable: true,
  },
  {
    id: 'PR-016', shopId: 'SH-005', name: 'منسف أردني',
    description: 'منسف بلحم الضأن والأرز والسمن.',
    price: 95, category: 'أطباق رئيسية', imageUrl: PRODUCT_IMAGES.kabsa, isAvailable: true,
  },

  // ── محل الفاكهة الطازجة (SH-006) ─────────────────────────────────
  {
    id: 'PR-017', shopId: 'SH-006', name: 'تفاح أحمر (١ كغ)',
    description: 'تفاح أحمر طازج مستورد.',
    price: 14, category: 'فواكه', imageUrl: PRODUCT_IMAGES.fruit, isAvailable: true,
  },
  {
    id: 'PR-018', shopId: 'SH-006', name: 'موز (١ كغ)',
    description: 'موز طازج ناضج.',
    price: 10, category: 'فواكه', imageUrl: PRODUCT_IMAGES.fruit, isAvailable: true,
  },
  {
    id: 'PR-019', shopId: 'SH-006', name: 'برتقال أبو صرة (١ كغ)',
    description: 'برتقال طازج خالٍ من البذور.',
    price: 12, category: 'فواكه', imageUrl: PRODUCT_IMAGES.fruit, isAvailable: false,
  },

  // ── سوبرماركت الحارة (SH-007) ────────────────────────────────────
  {
    id: 'PR-020', shopId: 'SH-007', name: 'مياه معدنية (٢٤)',
    description: 'كرتون مياه معدنية ٢٤ عبوة.',
    price: 15, category: 'مشروبات', imageUrl: PRODUCT_IMAGES.juice, isAvailable: true,
  },
  {
    id: 'PR-021', shopId: 'SH-007', name: 'أرز بسمتي (٥ كغ)',
    description: 'أرز بسمتي هندي فاخر.',
    price: 45, category: 'أساسيات', imageUrl: PRODUCT_IMAGES.snack, isAvailable: true,
  },
  {
    id: 'PR-022', shopId: 'SH-007', name: 'زيت زيتون (١ لتر)',
    description: 'زيت زيتون بكر ممتاز.',
    price: 38, category: 'أساسيات', imageUrl: PRODUCT_IMAGES.snack, isAvailable: true,
  },

  // ── مخبز زهرة الأصيل (SH-008) ────────────────────────────────────
  {
    id: 'PR-023', shopId: 'SH-008', name: 'خبز تميس',
    description: 'تميس طازج من الفرن.',
    price: 8, category: 'مخبوزات', imageUrl: PRODUCT_IMAGES.bread, isAvailable: true,
  },
  {
    id: 'PR-024', shopId: 'SH-008', name: 'معجنات جبن',
    description: 'صينية معجنات بالجبن الأبيض.',
    price: 20, category: 'معجنات', imageUrl: PRODUCT_IMAGES.pastry, isAvailable: true,
  },

  // ── مطعم النخلة (SH-009) ─────────────────────────────────────────
  {
    id: 'PR-025', shopId: 'SH-009', name: 'مشاوي مشكل',
    description: 'تشكيلة مشاوي لحم ودجاج وكباب.',
    price: 120, category: 'أطباق رئيسية', imageUrl: PRODUCT_IMAGES.grilled, isAvailable: true,
  },
  {
    id: 'PR-026', shopId: 'SH-009', name: 'برياني دجاج',
    description: 'برياني دجاج هندي بالتوابل العطرية.',
    price: 55, category: 'أطباق رئيسية', imageUrl: PRODUCT_IMAGES.kabsa, isAvailable: true,
  },
  {
    id: 'PR-027', shopId: 'SH-009', name: 'شوربة عدس',
    description: 'شوربة عدس دافئة مع ليمون.',
    price: 15, category: 'مقبلات', imageUrl: PRODUCT_IMAGES.salad, isAvailable: false,
  },

  // ── متجر التقنية الحديثة (SH-010) ────────────────────────────────
  {
    id: 'PR-028', shopId: 'SH-010', name: 'كابل USB-C',
    description: 'كابل شحن سريع USB-C بطول ١ متر.',
    price: 45, category: 'إكسسوارات', imageUrl: PRODUCT_IMAGES.gadget, isAvailable: true,
  },
  {
    id: 'PR-029', shopId: 'SH-010', name: 'سماعة بلوتوث',
    description: 'سماعة لاسلكية بمقاومة للماء.',
    price: 189, category: 'صوتيات', imageUrl: PRODUCT_IMAGES.gadget, isAvailable: true,
  },

  // ── مقهى الورد (SH-011) ──────────────────────────────────────────
  {
    id: 'PR-030', shopId: 'SH-011', name: 'موكا ساخنة',
    description: 'إسبريسو مع شوكولاتة وحليب مبخّر.',
    price: 24, category: 'مشروبات ساخنة', imageUrl: PRODUCT_IMAGES.coffee, isAvailable: true,
  },
  {
    id: 'PR-031', shopId: 'SH-011', name: 'تشيز كيك توت',
    description: 'شريحة تشيز كيك بالتوت الطازج.',
    price: 32, category: 'حلويات', imageUrl: PRODUCT_IMAGES.pastry, isAvailable: true,
  },

  // ── صيدلية الشفاء (SH-012) ───────────────────────────────────────
  {
    id: 'PR-032', shopId: 'SH-012', name: 'كمامات طبية (٥٠)',
    description: 'علبة كمامات طبية ٣ طبقات.',
    price: 25, category: 'مستلزمات', imageUrl: PRODUCT_IMAGES.pharma, isAvailable: true,
  },
  {
    id: 'PR-033', shopId: 'SH-012', name: 'معقم يدين ٥٠٠ مل',
    description: 'معقم يدين بكحول ٧٠٪.',
    price: 18, category: 'مستلزمات', imageUrl: PRODUCT_IMAGES.pharma, isAvailable: false,
  },
];

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly productsSignal = signal<Product[]>(structuredClone(CATALOG_DATA));

  readonly products = this.productsSignal.asReadonly();

  getProductsByShopId(shopId: string): Product[] {
    return this.productsSignal().filter(p => p.shopId === shopId);
  }

  getById(id: string): Product | null {
    return this.productsSignal().find(p => p.id === id) ?? null;
  }

  setAvailability(productId: string, isAvailable: boolean): void {
    this.productsSignal.update(list =>
      list.map(p => (p.id === productId ? { ...p, isAvailable } : p)),
    );
  }

  updateProduct(productId: string, data: Partial<Product>): void {
    this.productsSignal.update(list =>
      list.map(p => (p.id === productId ? { ...p, ...data, id: p.id, shopId: p.shopId } : p)),
    );
  }

  deleteProduct(productId: string): void {
    this.productsSignal.update(list => list.filter(p => p.id !== productId));
  }

  addProduct(data: Omit<Product, 'id'>): Product {
    const product: Product = {
      ...data,
      id: this.nextProductId(),
      name: data.name.trim(),
      description: data.description.trim(),
      category: data.category.trim(),
    };
    this.productsSignal.update(list => [product, ...list]);
    return product;
  }

  private nextProductId(): string {
    const max = this.productsSignal().reduce((acc, p) => {
      const n = Number(p.id.replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `PR-${String(max + 1).padStart(3, '0')}`;
  }
}
