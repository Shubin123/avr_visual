; a2-signaling.asm
; Simple public LED signaling demo for ATmega2560
; Cycles between two LED patterns on PORTL

.cseg
.org 0

start:
    ldi r16, 0xFF
    sts DDRL, r16     ; Set PORTL to output

loop:
    rcall set_leds
    rcall delay
    rcall display_message
    rcall delay
    rjmp loop

set_leds:
    ldi r16, 0b10101010
    sts PORTL, r16    ; Turn on alternating LEDs
    ret

display_message:
    ldi r16, 0b01010101
    sts PORTL, r16    ; Toggle alternating LEDs
    ret

delay:
    ldi r17, 0x0F
d1: ldi r18, 0xFF
d2: ldi r19, 0xFF
d3: dec r19
    brne d3
    dec r18
    brne d2
    dec r17
    brne d1
    ret

; Patterns table placed at 0x600 for test verification
.org 0x600
PATTERNS:
    .db 0xAA, 0x55
