.cseg
.org 0

		ldi r16, 0xFF
		sts DDRL, r16
		out DDRB, r16

loop:	ldi r16, 0b10000000
		sts PORTL, r16
		ldi r16, 0b00000010
		out PORTB, r16

		ldi r17, 0x0F
l1:		ldi r18, 0xFF
l2:		ldi r19, 0xFF
l3:		nop
		nop
		nop
		nop
		nop
		nop
		dec r19
		brne l3
		dec r18
		brne l2
		dec r17
		brne l1 	

		ldi r16, 0x00
		sts PORTL, r16
		out PORTB ,r16

		ldi r17, 0x0F
x1:		ldi r18, 0xFF
x2:		ldi r19, 0xFF
x3:		nop
		nop
		nop
		nop
		nop
		nop
		dec r19
		brne x3
		dec r18
		brne x2
		dec r17
		brne x1 	


done:	jmp loop
