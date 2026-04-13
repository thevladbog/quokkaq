package repository

import "gorm.io/gorm"

// NewTicketRepositoryWithDB wires a ticket repository to an explicit DB (tests, alternate boot paths).
func NewTicketRepositoryWithDB(db *gorm.DB) TicketRepository {
	if db == nil {
		panic("NewTicketRepositoryWithDB: nil *gorm.DB")
	}
	return &ticketRepository{db: db}
}

// NewCounterRepositoryWithDB wires a counter repository to an explicit DB.
func NewCounterRepositoryWithDB(db *gorm.DB) CounterRepository {
	if db == nil {
		panic("NewCounterRepositoryWithDB: nil *gorm.DB")
	}
	return &counterRepository{db: db}
}

// NewOperatorIntervalRepositoryWithDB wires an operator-interval repository to an explicit DB.
func NewOperatorIntervalRepositoryWithDB(db *gorm.DB) OperatorIntervalRepository {
	if db == nil {
		panic("NewOperatorIntervalRepositoryWithDB: nil *gorm.DB")
	}
	return &operatorIntervalRepository{db: db}
}
