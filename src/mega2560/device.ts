// ATmega2560 device model: peripheral register configs for avr8js, built from the
// same address/bit data as m2560def.inc (see sfr-map.generated.ts). avr8js ships
// GPIO port configs and an ADC/timer config shaped for the ATmega328p; register
// *addresses* for ports A-L and the ADC happen to coincide with the ATmega2560,
// but interrupt *vector addresses* mostly do not (the 2560 has 57 vectors vs the
// 328p's 26), so timers/ADC get fresh configs here rather than reusing avr8js's.
import type { ADCConfig, ADCMuxConfiguration, AVRPortConfig, AVRTimerConfig } from 'avr8js';
import { ADCMuxInputType, ADCReference } from 'avr8js';
import { SFR } from './sfr-map.generated';

export const RAMEND = SFR.RAMEND;
export const SRAM_START = SFR.SRAM_START;
export const FLASHEND_WORDS = SFR.FLASHEND;
export const E2END = SFR.E2END;
export const SRAM_BYTES = RAMEND - SRAM_START + 1;

/**
 * GPIO ports A-L (there is no PORTI on AVR to avoid confusion with the digit 1).
 * Only register addresses are modeled; external/pin-change interrupt wiring is
 * not implemented yet (see README "Known limitations") because the bit-to-pin
 * mapping differs substantially from the ATmega328p avr8js ships configs for,
 * and neither reference program in examples/ relies on INT0-7 or PCINT.
 */
function port(pin: number, ddr: number, portReg: number): AVRPortConfig {
  return { PIN: pin, DDR: ddr, PORT: portReg, externalInterrupts: [] };
}

export const mega2560Ports: Record<string, AVRPortConfig> = {
  A: port(SFR.PINA + 0x20, SFR.DDRA + 0x20, SFR.PORTA + 0x20),
  B: port(SFR.PINB + 0x20, SFR.DDRB + 0x20, SFR.PORTB + 0x20),
  C: port(SFR.PINC + 0x20, SFR.DDRC + 0x20, SFR.PORTC + 0x20),
  D: port(SFR.PIND + 0x20, SFR.DDRD + 0x20, SFR.PORTD + 0x20),
  E: port(SFR.PINE + 0x20, SFR.DDRE + 0x20, SFR.PORTE + 0x20),
  F: port(SFR.PINF + 0x20, SFR.DDRF + 0x20, SFR.PORTF + 0x20),
  G: port(SFR.PING + 0x20, SFR.DDRG + 0x20, SFR.PORTG + 0x20),
  H: port(SFR.PINH, SFR.DDRH, SFR.PORTH),
  J: port(SFR.PINJ, SFR.DDRJ, SFR.PORTJ),
  K: port(SFR.PINK, SFR.DDRK, SFR.PORTK),
  L: port(SFR.PINL, SFR.DDRL, SFR.PORTL),
};

/** Standard 328p-style 2-flag/8-bit timer bit layout: TOV=0, OCFA=1, OCFB=2 (no unit C). */
const bits2Unit = { TOV: 0, OCFA: 1, OCFB: 2, OCFC: 0, TOIE: 0, OCIEA: 1, OCIEB: 2, OCIEC: 0 };
/** 2560's 16-bit timers (1/3/4/5) all have a 3rd compare unit: TOV=0,OCFA=1,OCFB=2,OCFC=3. */
const bits3Unit = { TOV: 0, OCFA: 1, OCFB: 2, OCFC: 3, TOIE: 0, OCIEA: 1, OCIEB: 2, OCIEC: 3 };

const dividers1024 = { 0: 0, 1: 1, 2: 8, 3: 64, 4: 256, 5: 1024, 6: 0, 7: 0 };
const dividers2 = { 0: 0, 1: 1, 2: 8, 3: 32, 4: 64, 5: 128, 6: 256, 7: 1024 };

export const timer0Config: AVRTimerConfig = {
  bits: 8,
  captureInterrupt: 0,
  compAInterrupt: SFR.OC0Aaddr,
  compBInterrupt: SFR.OC0Baddr,
  compCInterrupt: 0,
  ovfInterrupt: SFR.OVF0addr,
  TIFR: SFR.TIFR0 + 0x20,
  OCRA: SFR.OCR0A + 0x20,
  OCRB: SFR.OCR0B + 0x20,
  OCRC: 0,
  ICR: 0,
  TCNT: SFR.TCNT0 + 0x20,
  TCCRA: SFR.TCCR0A + 0x20,
  TCCRB: SFR.TCCR0B + 0x20,
  TCCRC: 0,
  TIMSK: SFR.TIMSK0,
  dividers: dividers1024,
  compPortA: mega2560Ports.B.PORT,
  compPinA: 7,
  compPortB: mega2560Ports.G.PORT,
  compPinB: 5,
  compPortC: 0,
  compPinC: 0,
  externalClockPort: 0,
  externalClockPin: 0,
  ...bits2Unit,
};

export const timer2Config: AVRTimerConfig = {
  bits: 8,
  captureInterrupt: 0,
  compAInterrupt: SFR.OC2Aaddr,
  compBInterrupt: SFR.OC2Baddr,
  compCInterrupt: 0,
  ovfInterrupt: SFR.OVF2addr,
  TIFR: SFR.TIFR2 + 0x20,
  OCRA: SFR.OCR2A,
  OCRB: SFR.OCR2B,
  OCRC: 0,
  ICR: 0,
  TCNT: SFR.TCNT2,
  TCCRA: SFR.TCCR2A,
  TCCRB: SFR.TCCR2B,
  TCCRC: 0,
  TIMSK: SFR.TIMSK2,
  dividers: dividers2,
  compPortA: mega2560Ports.B.PORT,
  compPinA: 4,
  compPortB: mega2560Ports.H.PORT,
  compPinB: 6,
  compPortC: 0,
  compPinC: 0,
  externalClockPort: 0,
  externalClockPin: 0,
  ...bits2Unit,
};

function timer16(cfg: {
  compA: number; compB: number; compC: number; ovf: number; capt: number;
  TIFR: number; TIMSK: number; OCRA: number; OCRB: number; OCRC: number; ICR: number;
  TCNT: number; TCCRA: number; TCCRB: number; TCCRC: number;
  compPortA: number; compPinA: number; compPortB: number; compPinB: number;
  compPortC: number; compPinC: number;
}): AVRTimerConfig {
  return {
    bits: 16,
    captureInterrupt: cfg.capt,
    compAInterrupt: cfg.compA,
    compBInterrupt: cfg.compB,
    compCInterrupt: cfg.compC,
    ovfInterrupt: cfg.ovf,
    TIFR: cfg.TIFR + 0x20,
    OCRA: cfg.OCRA,
    OCRB: cfg.OCRB,
    OCRC: cfg.OCRC,
    ICR: cfg.ICR,
    TCNT: cfg.TCNT,
    TCCRA: cfg.TCCRA,
    TCCRB: cfg.TCCRB,
    TCCRC: cfg.TCCRC,
    TIMSK: cfg.TIMSK,
    dividers: dividers1024,
    compPortA: cfg.compPortA,
    compPinA: cfg.compPinA,
    compPortB: cfg.compPortB,
    compPinB: cfg.compPinB,
    compPortC: cfg.compPortC,
    compPinC: cfg.compPinC,
    externalClockPort: 0,
    externalClockPin: 0,
    ...bits3Unit,
  };
}

export const timer1Config = timer16({
  compA: SFR.OC1Aaddr, compB: SFR.OC1Baddr, compC: SFR.OC1Caddr, ovf: SFR.OVF1addr, capt: SFR.ICP1addr,
  TIFR: SFR.TIFR1, TIMSK: SFR.TIMSK1,
  OCRA: SFR.OCR1AL, OCRB: SFR.OCR1BL, OCRC: SFR.OCR1CL, ICR: SFR.ICR1L,
  TCNT: SFR.TCNT1L, TCCRA: SFR.TCCR1A, TCCRB: SFR.TCCR1B, TCCRC: SFR.TCCR1C,
  compPortA: mega2560Ports.B.PORT, compPinA: 5,
  compPortB: mega2560Ports.B.PORT, compPinB: 6,
  compPortC: mega2560Ports.B.PORT, compPinC: 7,
});

export const timer3Config = timer16({
  compA: SFR.OC3Aaddr, compB: SFR.OC3Baddr, compC: SFR.OC3Caddr, ovf: SFR.OVF3addr, capt: SFR.ICP3addr,
  TIFR: SFR.TIFR3, TIMSK: SFR.TIMSK3,
  OCRA: SFR.OCR3AL, OCRB: SFR.OCR3BL, OCRC: SFR.OCR3CL, ICR: SFR.ICR3L,
  TCNT: SFR.TCNT3L, TCCRA: SFR.TCCR3A, TCCRB: SFR.TCCR3B, TCCRC: SFR.TCCR3C,
  compPortA: mega2560Ports.E.PORT, compPinA: 3,
  compPortB: mega2560Ports.E.PORT, compPinB: 4,
  compPortC: mega2560Ports.E.PORT, compPinC: 5,
});

export const timer4Config = timer16({
  compA: SFR.OC4Aaddr, compB: SFR.OC4Baddr, compC: SFR.OC4Caddr, ovf: SFR.OVF4addr, capt: SFR.ICP4addr,
  TIFR: SFR.TIFR4, TIMSK: SFR.TIMSK4,
  OCRA: SFR.OCR4AL, OCRB: SFR.OCR4BL, OCRC: SFR.OCR4CL, ICR: SFR.ICR4L,
  TCNT: SFR.TCNT4L, TCCRA: SFR.TCCR4A, TCCRB: SFR.TCCR4B, TCCRC: SFR.TCCR4C,
  compPortA: mega2560Ports.H.PORT, compPinA: 3,
  compPortB: mega2560Ports.H.PORT, compPinB: 4,
  compPortC: mega2560Ports.H.PORT, compPinC: 5,
});

export const timer5Config = timer16({
  compA: SFR.OC5Aaddr, compB: SFR.OC5Baddr, compC: SFR.OC5Caddr, ovf: SFR.OVF5addr, capt: SFR.ICP5addr,
  TIFR: SFR.TIFR5, TIMSK: SFR.TIMSK5,
  OCRA: SFR.OCR5AL, OCRB: SFR.OCR5BL, OCRC: SFR.OCR5CL, ICR: SFR.ICR5L,
  TCNT: SFR.TCNT5L, TCCRA: SFR.TCCR5A, TCCRB: SFR.TCCR5B, TCCRC: SFR.TCCR5C,
  compPortA: mega2560Ports.L.PORT, compPinA: 3,
  compPortB: mega2560Ports.L.PORT, compPinB: 4,
  compPortC: mega2560Ports.L.PORT, compPinC: 5,
});

export const allTimerConfigs = [
  timer0Config,
  timer1Config,
  timer2Config,
  timer3Config,
  timer4Config,
  timer5Config,
];

/**
 * ADC channels 0-7 are single-ended on ADC0-7 (PORTF); 8-15 reuse the same MUX
 * values on PORTK for the 2560. We only model channel 0 with a live value (the
 * LCD-shield button ladder); everything else reads a steady 5V-ish constant,
 * which is enough for programs that don't otherwise use the ADC.
 */
export const mega2560AdcChannels: ADCMuxConfiguration = {
  0: { type: ADCMuxInputType.SingleEnded, channel: 0 },
  1: { type: ADCMuxInputType.SingleEnded, channel: 1 },
  2: { type: ADCMuxInputType.SingleEnded, channel: 2 },
  3: { type: ADCMuxInputType.SingleEnded, channel: 3 },
  4: { type: ADCMuxInputType.SingleEnded, channel: 4 },
  5: { type: ADCMuxInputType.SingleEnded, channel: 5 },
  6: { type: ADCMuxInputType.SingleEnded, channel: 6 },
  7: { type: ADCMuxInputType.SingleEnded, channel: 7 },
  8: { type: ADCMuxInputType.Temperature },
  30: { type: ADCMuxInputType.Constant, voltage: 1.1 },
  31: { type: ADCMuxInputType.Constant, voltage: 0 },
};

export const mega2560AdcConfig: ADCConfig = {
  ADMUX: SFR.ADMUX,
  ADCSRA: SFR.ADCSRA,
  ADCSRB: SFR.ADCSRB,
  ADCL: SFR.ADCL,
  ADCH: SFR.ADCH,
  DIDR0: SFR.DIDR0,
  adcInterrupt: SFR.ADCCaddr,
  numChannels: 16,
  muxInputMask: 0x1f,
  muxChannels: mega2560AdcChannels,
  adcReferences: [
    ADCReference.AREF,
    ADCReference.AVCC,
    ADCReference.Reserved,
    ADCReference.Internal1V1,
  ],
};

/** Word-address interrupt vector table, in vector order (for the debugger UI and ISR labeling). */
export const interruptVectors: { address: number; name: string }[] = [
  { address: 0x0000, name: 'RESET' },
  { address: SFR.INT0addr, name: 'INT0' },
  { address: SFR.INT1addr, name: 'INT1' },
  { address: SFR.INT2addr, name: 'INT2' },
  { address: SFR.INT3addr, name: 'INT3' },
  { address: SFR.INT4addr, name: 'INT4' },
  { address: SFR.INT5addr, name: 'INT5' },
  { address: SFR.INT6addr, name: 'INT6' },
  { address: SFR.INT7addr, name: 'INT7' },
  { address: SFR.PCI0addr, name: 'PCINT0' },
  { address: SFR.PCI1addr, name: 'PCINT1' },
  { address: SFR.PCI2addr, name: 'PCINT2' },
  { address: SFR.WDTaddr, name: 'WDT' },
  { address: SFR.OC2Aaddr, name: 'TIMER2_COMPA' },
  { address: SFR.OC2Baddr, name: 'TIMER2_COMPB' },
  { address: SFR.OVF2addr, name: 'TIMER2_OVF' },
  { address: SFR.ICP1addr, name: 'TIMER1_CAPT' },
  { address: SFR.OC1Aaddr, name: 'TIMER1_COMPA' },
  { address: SFR.OC1Baddr, name: 'TIMER1_COMPB' },
  { address: SFR.OC1Caddr, name: 'TIMER1_COMPC' },
  { address: SFR.OVF1addr, name: 'TIMER1_OVF' },
  { address: SFR.OC0Aaddr, name: 'TIMER0_COMPA' },
  { address: SFR.OC0Baddr, name: 'TIMER0_COMPB' },
  { address: SFR.OVF0addr, name: 'TIMER0_OVF' },
  { address: SFR.SPIaddr, name: 'SPI_STC' },
  { address: SFR.URXC0addr, name: 'USART0_RX' },
  { address: SFR.UDRE0addr, name: 'USART0_UDRE' },
  { address: SFR.UTXC0addr, name: 'USART0_TX' },
  { address: SFR.ACIaddr, name: 'ANALOG_COMP' },
  { address: SFR.ADCCaddr, name: 'ADC' },
  { address: SFR.ERDYaddr, name: 'EE_READY' },
  { address: SFR.ICP3addr, name: 'TIMER3_CAPT' },
  { address: SFR.OC3Aaddr, name: 'TIMER3_COMPA' },
  { address: SFR.OC3Baddr, name: 'TIMER3_COMPB' },
  { address: SFR.OC3Caddr, name: 'TIMER3_COMPC' },
  { address: SFR.OVF3addr, name: 'TIMER3_OVF' },
  { address: SFR.URXC1addr, name: 'USART1_RX' },
  { address: SFR.UDRE1addr, name: 'USART1_UDRE' },
  { address: SFR.UTXC1addr, name: 'USART1_TX' },
  { address: SFR.TWIaddr, name: 'TWI' },
  { address: SFR.SPMRaddr, name: 'SPM_READY' },
  { address: SFR.ICP4addr, name: 'TIMER4_CAPT' },
  { address: SFR.OC4Aaddr, name: 'TIMER4_COMPA' },
  { address: SFR.OC4Baddr, name: 'TIMER4_COMPB' },
  { address: SFR.OC4Caddr, name: 'TIMER4_COMPC' },
  { address: SFR.OVF4addr, name: 'TIMER4_OVF' },
  { address: SFR.ICP5addr, name: 'TIMER5_CAPT' },
  { address: SFR.OC5Aaddr, name: 'TIMER5_COMPA' },
  { address: SFR.OC5Baddr, name: 'TIMER5_COMPB' },
  { address: SFR.OC5Caddr, name: 'TIMER5_COMPC' },
  { address: SFR.OVF5addr, name: 'TIMER5_OVF' },
  { address: SFR.URXC2addr, name: 'USART2_RX' },
  { address: SFR.UDRE2addr, name: 'USART2_UDRE' },
  { address: SFR.UTXC2addr, name: 'USART2_TX' },
  { address: SFR.URXC3addr, name: 'USART3_RX' },
  { address: SFR.UDRE3addr, name: 'USART3_UDRE' },
  { address: SFR.UTXC3addr, name: 'USART3_TX' },
];
