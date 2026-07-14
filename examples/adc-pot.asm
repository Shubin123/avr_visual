; adc-pot.asm
; Read the ADC (channel 0, the keypad-shield analog input) in a polling loop
; and light up LEDs on PORTL proportional to the measured voltage.
; Demonstrates: ADC setup, starting a conversion, waiting for completion,
; reading the 10-bit result, and mapping it onto GPIO output.

.cseg
.org 0

start:
    ldi r16, 0xFF
    sts DDRL, r16          ; PORTL -> output (the 8 LEDs)

    ; ADMUX: select AVCC as reference (REFS0=1), right-adjust result (ADLAR=0),
    ; and channel 0 (MUX bits all 0).
    ldi r16, (1 << REFS0)
    sts ADMUX, r16

    ; ADCSRA: enable the ADC (ADEN=1) and pick prescaler 128 (ADPS2:0 = 111)
    ; so the conversion clock is well within spec at 16 MHz.
    ldi r16, (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0)
    sts ADCSRA, r16

main_loop:
    ; Start a single conversion (ADSC=1). In single-conversion mode the bit
    ; stays set until the conversion finishes, then clears itself.
    lds r16, ADCSRA
    ori r16, (1 << ADSC)
    sts ADCSRA, r16

wait_adc:
    lds r16, ADCSRA
    sbrc r16, ADSC         ; skip next if ADSC cleared (conversion done)
    rjmp wait_adc

    ; Read the 10-bit result. ADCL MUST be read before ADCH.
    lds r16, ADCL
    lds r17, ADCH          ; r17:r16 now holds 0..1023

    ; Scale the 10-bit value (0..1023) down to 0..255 by dropping the low 2 bits.
    ; (shifting right by 2 == divide by 4)
    lsr r17
    ror r16
    lsr r17
    ror r16

    ; Light the LEDs with the scaled value.
    sts PORTL, r16

    rjmp main_loop
