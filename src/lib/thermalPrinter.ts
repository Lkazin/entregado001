// Utilitário de Impressão Térmica de Cupom (80mm e 58mm)
// Desenvolvido para impressoras térmicas ESC/POS (Epson, Elgin, Daruma, Bematech, etc.)

export interface PrintableOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  address: string;
  region: string;
  itemsSummary: string;
  total: number;
  paymentMethod: 'pix_manual' | 'cash_delivery' | 'card_terminal' | string;
  paymentStatus?: string;
  deliveryPin: string;
  driverName?: string | null;
  assignedDriverName?: string | null;
  createdAt: string;
  createdAtISO?: string;
  notes?: string;
  subtotal?: number;
  deliveryFee?: number;
  changeFor?: number | null;
  addressDetail?: {
    street?: string;
    number?: string;
    complement?: string;
    reference?: string;
    region?: string;
  };
  items?: Array<{
    type?: string;
    name?: string;
    quantity?: number;
    size?: string | null;
    flavors?: string[];
    crust?: string | null;
    unitPrice?: number;
    totalPrice?: number;
  }>;
}

export type PaperWidth = '80mm' | '58mm';

const money = (val?: number | null): string => {
  return `R$ ${(Number(val || 0)).toFixed(2).replace('.', ',')}`;
};

export function buildReceiptHtml(order: PrintableOrder, paperWidth: PaperWidth = '80mm'): string {
  const is58 = paperWidth === '58mm';
  const widthMm = is58 ? '48mm' : '72mm';
  const fontSize = is58 ? '11px' : '12px';
  const titleSize = is58 ? '15px' : '17px';
  const pinSize = is58 ? '18px' : '22px';

  const ad = order.addressDetail;
  const fullAddress = ad && (ad.street || ad.number)
    ? `${ad.street || ''}, ${ad.number || ''}${ad.complement ? ' - ' + ad.complement : ''}`
    : order.address;

  const paymentLabel =
    order.paymentMethod === 'pix_manual' ? 'PIX' :
    order.paymentMethod === 'cash_delivery' ? 'DINHEIRO NA ENTREGA' :
    order.paymentMethod === 'card_terminal' ? 'CARTAO / MAQUININHA' :
    String(order.paymentMethod).toUpperCase();

  const orderDate = order.createdAtISO
    ? new Date(order.createdAtISO).toLocaleString('pt-BR')
    : order.createdAt;

  let itemsHtml = '';
  if (Array.isArray(order.items) && order.items.length > 0) {
    itemsHtml = order.items.map(it => {
      const flavorsText = it.flavors && it.flavors.length > 0 ? `<div style="font-size: 0.9em; padding-left: 8px;">Sabores: ${it.flavors.join(' + ')}</div>` : '';
      const crustText = it.crust ? `<div style="font-size: 0.9em; padding-left: 8px;">Borda: ${it.crust}</div>` : '';
      const priceText = it.totalPrice && it.totalPrice > 0 ? money(it.totalPrice) : '';
      return `
        <div style="margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>${it.quantity}x ${it.name || 'Item'}${it.size ? ' (' + it.size + ')' : ''}</span>
            <span>${priceText}</span>
          </div>
          ${flavorsText}
          ${crustText}
        </div>
      `;
    }).join('');
  } else {
    itemsHtml = `
      <div style="font-size: 0.95em; white-space: pre-wrap; line-height: 1.3;">
        ${order.itemsSummary || 'Pizza e adicionais'}
      </div>
    `;
  }

  const changeInfo = order.changeFor && order.changeFor > 0 ? `
    <div style="display: flex; justify-content: space-between; font-size: 0.95em; margin-top: 2px;">
      <span>Troco para:</span>
      <strong>${money(order.changeFor)}</strong>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 0.95em; margin-top: 2px; color: #000;">
      <span>Devolver de troco:</span>
      <strong>${money(order.changeFor - order.total)}</strong>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comanda #${order.orderNumber}</title>
  <style>
    @page {
      margin: 0;
      size: auto;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 3mm 2mm;
      width: ${widthMm};
      max-width: ${widthMm};
      font-family: 'Courier New', Courier, monospace, sans-serif;
      font-size: ${fontSize};
      color: #000;
      background: #fff;
      line-height: 1.25;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px solid #000;
      margin: 8px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .pin-box {
      border: 2px solid #000;
      border-radius: 4px;
      padding: 6px 4px;
      text-align: center;
      margin: 8px 0;
      background: #fff;
    }
    .pin-code {
      font-size: ${pinSize};
      font-weight: 900;
      letter-spacing: 4px;
      display: block;
      margin-top: 2px;
    }
    .obs-box {
      border: 1px solid #000;
      padding: 4px;
      margin: 4px 0;
      background: #f4f4f4;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-size: ${titleSize}; font-weight: 900; letter-spacing: 1px;">BELLA PIZZA</div>
    <div style="font-size: 0.9em; margin-top: 2px;">*** COMANDA DE PRODUÇÃO ***</div>
  </div>

  <div class="double-divider"></div>

  <div class="row">
    <span class="bold" style="font-size: 1.15em;">PEDIDO: #${order.orderNumber}</span>
    <span style="font-size: 0.85em;">${orderDate}</span>
  </div>

  <div class="divider"></div>

  <div style="margin-bottom: 4px;">
    <div><strong>CLIENTE:</strong> ${order.customerName}</div>
    <div><strong>TEL:</strong> ${order.phone || 'Não informado'}</div>
    <div><strong>ENDEREÇO:</strong> ${fullAddress}</div>
    <div><strong>BAIRRO:</strong> ${order.region}</div>
    ${ad?.reference ? `<div><strong>REF:</strong> ${ad.reference}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="bold" style="text-align: center; margin-bottom: 4px;">ITENS DO PEDIDO</div>
  <div class="divider"></div>

  ${itemsHtml}

  ${order.notes ? `
    <div class="divider"></div>
    <div class="obs-box">
      OBS: ${order.notes}
    </div>
  ` : ''}

  <div class="divider"></div>

  ${typeof order.subtotal === 'number' && order.subtotal > 0 ? `
    <div class="row">
      <span>Subtotal:</span>
      <span>${money(order.subtotal)}</span>
    </div>
  ` : ''}
  ${typeof order.deliveryFee === 'number' && order.deliveryFee > 0 ? `
    <div class="row">
      <span>Taxa de Entrega:</span>
      <span>${money(order.deliveryFee)}</span>
    </div>
  ` : ''}
  <div class="row bold" style="font-size: 1.1em; margin-top: 3px;">
    <span>TOTAL:</span>
    <span>${money(order.total)}</span>
  </div>

  <div class="divider"></div>

  <div>
    <strong>PAGAMENTO:</strong> ${paymentLabel}
    ${changeInfo}
  </div>

  <div class="double-divider"></div>

  <div class="pin-box">
    <div style="font-size: 0.8em; font-weight: bold;">PIN DE CONFIRMAÇÃO DE ENTREGA</div>
    <span class="pin-code">[ ${order.deliveryPin || '----'} ]</span>
    <div style="font-size: 0.75em; margin-top: 2px;">(Solicitar este código ao cliente)</div>
  </div>

  ${order.driverName || order.assignedDriverName ? `
    <div style="font-size: 0.85em; text-align: center; margin-top: 4px;">
      Motoboy: <strong>${order.assignedDriverName || order.driverName}</strong>
    </div>
  ` : ''}

  <div style="text-align: center; font-size: 0.75em; margin-top: 8px; color: #555;">
    Sistema Bella Pizza • NovaesWeb
  </div>
</body>
</html>
  `.trim();
}

/**
 * Dispara a impressão térmica de um pedido usando iframe isolado.
 * Evita bugs visuais na página principal e envia comandos de impressão limpos.
 */
export function printThermalOrder(order: PrintableOrder, paperWidth: PaperWidth = '80mm'): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      document.body.appendChild(iframe);

      const html = buildReceiptHtml(order, paperWidth);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        resolve(false);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (e) {}
            resolve(true);
          }, 1500);
        } catch (err) {
          console.error('Erro ao imprimir via iframe:', err);
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve(false);
        }
      }, 300);
    } catch (e) {
      console.error('Falha geral na impressão térmica:', e);
      resolve(false);
    }
  });
}

/**
 * Função para imprimir cupom de teste para validar alinhamento e impressora 80mm/58mm.
 */
export function testPrintThermal(paperWidth: PaperWidth = '80mm'): Promise<boolean> {
  const dummy: PrintableOrder = {
    id: 'test-print',
    orderNumber: 999,
    customerName: 'Cliente Teste Impressora',
    phone: '(11) 99999-8888',
    address: 'Rua das Pizzas, 100 - Apto 10',
    region: 'Centro (Zona Sul)',
    itemsSummary: '1x Pizza Grande Calabresa Especial • 1x Refrigerante Guaraná 2L',
    total: 75.00,
    subtotal: 70.00,
    deliveryFee: 5.00,
    paymentMethod: 'cash_delivery',
    changeFor: 100.00,
    deliveryPin: '7412',
    createdAt: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAtISO: new Date().toISOString(),
    notes: 'Favor testar a guilhotina e corte térmico da impressora.',
    items: [
      {
        name: 'Pizza Grande (8 fatias)',
        quantity: 1,
        flavors: ['Calabresa Especial', 'Quatro Queijos'],
        crust: 'Borda Recheada de Catupiry',
        totalPrice: 62.00
      },
      {
        name: 'Guaraná Antarctica 2L',
        quantity: 1,
        totalPrice: 13.00
      }
    ]
  };
  return printThermalOrder(dummy, paperWidth);
}
