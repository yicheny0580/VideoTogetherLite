package main

type VtContext struct {
	Language string
}

func NewVtContext(language string) *VtContext {
	return &VtContext{
		Language: language,
	}
}
