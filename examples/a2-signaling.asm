; a2-signaling.asm
; Simple public LED signaling demo for ATmega2560
; Cycles between two LED patterns on PORTL

.cseg
.org 0

start:
    ldi r16, 0xFF
    sts DDRL, r16     ; Set PORTL to output

loop:
    ldi r16, 0b10101010
    sts PORTL, r16    ; Turn on alternating LEDs
    rcall delay

    ldi r16, 0b01010101
    sts PORTL, r16    ; Toggle alternating LEDs
    rcall delay

    rjmp loop

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
